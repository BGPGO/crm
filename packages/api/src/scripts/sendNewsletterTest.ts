/**
 * Cria uma edição da newsletter a partir de um HTML anotado com data-slot
 * e envia um teste rastreado.
 * Uso: npx tsx --env-file=.env src/scripts/sendNewsletterTest.ts <html-path> <email> [assunto]
 * Obs: API_URL deve apontar pra API pública (os links de tracking usam ela).
 */
import fs from 'fs';
import prisma from '../lib/prisma';
import { extractLinks, sendNewsletterTo } from '../services/newsletterService';

async function main() {
  const [htmlPath, email, subjectArg] = process.argv.slice(2);
  if (!htmlPath || !email) {
    console.error('uso: sendNewsletterTest.ts <html-path> <email> [assunto]');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const links = extractLinks(html);
  const slotCount = Object.keys(links).length;
  if (slotCount === 0) {
    console.error('HTML sem <a data-slot> — nada pra rastrear.');
    process.exit(1);
  }
  console.log(`Slots detectados (${slotCount}):`, Object.keys(links).join(', '));

  const subject =
    subjectArg || 'BGP Insights — Sua semana em gestão financeira · 07/07';

  const edition = await prisma.newsletterEdition.create({
    data: { subject, html, links: links as object, isTest: true },
  });
  console.log('Edição criada:', edition.id);

  const result = await sendNewsletterTo(edition.id, email);
  if (result.error) {
    console.error('Falha no envio:', result.error);
    process.exit(1);
  }

  await prisma.newsletterEdition.update({
    where: { id: edition.id },
    data: { status: 'SENT', sentAt: new Date(), recipientCount: 1 },
  });

  console.log(`Enviado pra ${email} — messageId ${result.id}`);
  console.log(`Tela: /marketing/newsletter/${edition.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
