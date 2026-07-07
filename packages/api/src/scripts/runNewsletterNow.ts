/**
 * Monta a edição da newsletter AGORA (feeds + curadoria IA + posts ContIA)
 * e envia como teste pro email dado.
 * Uso: npx tsx --env-file=.env src/scripts/runNewsletterNow.ts <email>
 * Requer: API_URL público, CONTIA_SUPABASE_URL/SERVICE_KEY, OPENAI_API_KEY, RESEND_API_KEY.
 */
import prisma from '../lib/prisma';
import { runNewsletterTest } from '../services/newsletterAutomation';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('uso: runNewsletterNow.ts <email>');
    process.exit(1);
  }
  console.log('Montando edição (feeds + IA + ContIA)...');
  const { editionId } = await runNewsletterTest(email);
  console.log(`Edição ${editionId} enviada pra ${email}`);
  console.log(`Tela: /marketing/newsletter/${editionId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
