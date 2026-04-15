/**
 * One-off: uploads the 2 GO BI dashboard images from
 * packages/api/public/email-assets/ to a public Supabase Storage bucket.
 *
 * Why: the templates reference these images via an API static route
 * (/email-assets/...) that only exists after the next API deploy. Supabase
 * Storage gives us a stable public URL that works immediately — including
 * in the web editor preview.
 *
 * Run: npx tsx packages/api/src/seeds/uploadEmailAssets.ts
 * Prints the public URLs at the end.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY!,
);

const BUCKET = 'email-assets';
const ASSETS = [
  { local: 'gobi-dashboard-1.png', remote: 'gobi-dashboard-1.png' },
  { local: 'gobi-dashboard-2.png', remote: 'gobi-dashboard-2.png' },
];

async function ensureBucket() {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (!error && data) {
    console.log(`Bucket "${BUCKET}" já existe (public=${data.public})`);
    if (!data.public) {
      const { error: updErr } = await supabase.storage.updateBucket(BUCKET, { public: true });
      if (updErr) throw new Error(`Falha ao tornar bucket público: ${updErr.message}`);
      console.log(`Bucket "${BUCKET}" tornado público`);
    }
    return;
  }
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  });
  if (createErr) throw new Error(`Falha ao criar bucket: ${createErr.message}`);
  console.log(`Bucket "${BUCKET}" criado (público)`);
}

async function uploadOne(localName: string, remotePath: string): Promise<string> {
  const fullPath = path.join(__dirname, '..', '..', 'public', 'email-assets', localName);
  if (!fs.existsSync(fullPath)) throw new Error(`Arquivo não encontrado: ${fullPath}`);
  const buffer = fs.readFileSync(fullPath);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(remotePath, buffer, {
      contentType: 'image/png',
      upsert: true,
      cacheControl: '31536000',
    });
  if (error) throw new Error(`Upload falhou para ${remotePath}: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(remotePath);
  return data.publicUrl;
}

async function run() {
  await ensureBucket();
  const urls: Record<string, string> = {};
  for (const { local, remote } of ASSETS) {
    const url = await uploadOne(local, remote);
    urls[local] = url;
    console.log(`✅ ${local}  →  ${url}`);
  }
  console.log('\n────────────────────────────────────────');
  console.log('URLs públicas para colar nos templates:');
  for (const [k, v] of Object.entries(urls)) console.log(`  ${k}: ${v}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
