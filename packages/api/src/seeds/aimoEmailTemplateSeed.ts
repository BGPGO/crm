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
import { AIMO_LOGO_DATA_URL } from './aimoLogoBase64';

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

  const rawHtml: string = fs.readFileSync(HTML_FILE, 'utf-8');
  // Inlinear a logo AIMO como data-URL base64 — substitui {{LOGO_URL}} no HTML
  // antes do upsert. Resend deixa data-URLs passarem; clientes (Gmail web,
  // Outlook 2016+, Apple Mail) renderizam normalmente.
  const htmlContent: string = rawHtml.replace(/\{\{LOGO_URL\}\}/g, AIMO_LOGO_DATA_URL);
  console.log(
    `[aimoEmailTemplateSeed] HTML carregado (raw=${rawHtml.length} chars, com logo inline=${htmlContent.length} chars)`,
  );

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
