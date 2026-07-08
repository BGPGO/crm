/**
 * Sobe assets estáticos da newsletter (logos de veículos) pro bucket público
 * `newsletter-assets` do Supabase do CRM e imprime as URLs públicas.
 *
 * Uso: npx tsx --env-file=.env src/scripts/uploadNewsletterAssets.ts <arquivo1.png> [arquivo2.png...]
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import { supabase } from '../lib/supabase';

const BUCKET = 'newsletter-assets';

(async () => {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('uso: uploadNewsletterAssets.ts <arquivo.png> [...]');
    process.exit(1);
  }

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw listErr;
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) throw error;
    console.log(`bucket ${BUCKET} criado (público)`);
  }

  for (const file of files) {
    const nome = basename(file);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(nome, readFileSync(file), { contentType: 'image/png', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
    console.log(`${nome} → ${data.publicUrl}`);
  }
})();
