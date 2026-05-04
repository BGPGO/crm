/**
 * Seed: AIMO Email Template — Base v1
 *
 * Faz upsert do EmailTemplate `aimo-template-base-v1` no banco, lendo o HTML
 * de `aimoEmailTemplate.html` (mesmo diretorio).
 *
 * Idempotente: pode rodar quantas vezes quiser. Sempre atualiza o htmlContent
 * com o conteudo mais recente do arquivo .html.
 *
 * Uso: npm run seed:aimo-template --workspace=packages/api
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TEMPLATE_ID = 'aimo-template-base-v1';
const TEMPLATE_NAME = 'AIMO — Base v1';
const TEMPLATE_SUBJECT = '{{HEADLINE}}';
const HTML_FILE = path.join(__dirname, 'aimoEmailTemplate.html');

async function main(): Promise<void> {
  console.log('[aimoEmailTemplateSeed] iniciando...');

  if (!fs.existsSync(HTML_FILE)) {
    throw new Error(`HTML nao encontrado em: ${HTML_FILE}`);
  }

  const htmlContent: string = fs.readFileSync(HTML_FILE, 'utf-8');
  console.log(`[aimoEmailTemplateSeed] HTML carregado (${htmlContent.length} chars)`);

  const template = await prisma.emailTemplate.upsert({
    where: { id: TEMPLATE_ID },
    create: {
      id: TEMPLATE_ID,
      name: TEMPLATE_NAME,
      subject: TEMPLATE_SUBJECT,
      htmlContent,
      brand: 'AIMO',
      isActive: true,
    },
    update: {
      name: TEMPLATE_NAME,
      subject: TEMPLATE_SUBJECT,
      htmlContent,
      brand: 'AIMO',
      isActive: true,
    },
  });

  console.log(
    `[aimoEmailTemplateSeed] EmailTemplate "${template.name}" (id=${template.id}) brand=${template.brand} isActive=${template.isActive}`,
  );
  console.log('[aimoEmailTemplateSeed] concluido com sucesso.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[aimoEmailTemplateSeed] FALHOU:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
