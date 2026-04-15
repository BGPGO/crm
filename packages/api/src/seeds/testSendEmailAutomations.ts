/**
 * Teste: envia os 7 emails da automação por etapa para um destinatário,
 * simulando exatamente o fluxo que o automationActions.ts faz no envio real.
 *
 * - Aplica placeholder replace (*|PRIMEIRO_NOME|* etc)
 * - stripOuterWrapper + wrapInBrandTemplate
 * - Envia via Resend com subject e prefixo [TESTE]
 * - Delay de 2s entre emails pra não bater rate limit
 *
 * Run: npx tsx packages/api/src/seeds/testSendEmailAutomations.ts
 */

import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { stripOuterWrapper } from '../services/emailSender';
import { wrapInBrandTemplate } from '../services/emailTemplate';

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

const RECIPIENT = 'oliver@bertuzzipatrimonial.com.br';
const FAKE_FULL_NAME = 'Oliver Bertuzzi';
const FROM = 'BGPGO CRM <noreply@bertuzzipatrimonial.app.br>';

// Mesma ordem da cadência no funil
const TEMPLATE_NAMES = [
  'Boas-vindas #1 — Contato Feito',
  'Boas-vindas #2 — Contato Feito',
  'Conversa Realizada — Marcar Reunião',
  'Reunião Agendada — Reunião Marcada',
  'Envio Feito — Proposta Enviada',
  'Aguardando Dados — Etapa',
  'Aguardando Assinatura — Etapa',
];

function applyPlaceholders(text: string, fullName: string): string {
  const firstName = fullName.split(' ')[0] || '';
  return text
    .replace(/\*\|PRIMEIRO_NOME\|\*/g, firstName)
    .replace(/\{\{primeiro_nome\}\}/g, firstName)
    .replace(/\{\{nome\}\}/g, fullName);
}

async function run() {
  console.log(`🧪 Enviando ${TEMPLATE_NAMES.length} emails de teste para ${RECIPIENT}\n`);
  console.log(`   Nome simulado: "${FAKE_FULL_NAME}"  →  firstName = "${FAKE_FULL_NAME.split(' ')[0]}"\n`);

  const unsubUrl = `https://crm.bertuzzipatrimonial.com.br/api/unsubscribe/email/${Buffer.from(
    RECIPIENT,
    'utf-8'
  ).toString('base64url')}`;

  let sent = 0;
  let failed = 0;

  for (const [idx, name] of TEMPLATE_NAMES.entries()) {
    const template = await prisma.emailTemplate.findFirst({
      where: { name },
      select: { id: true, name: true, subject: true, htmlContent: true },
    });
    if (!template) {
      console.warn(`⚠️  Template "${name}" não encontrado — pulando`);
      failed++;
      continue;
    }

    // Replicar exatamente o que automationActions.ts:231-253 faz
    const rawHtml = applyPlaceholders(template.htmlContent, FAKE_FULL_NAME);
    const subject = `[TESTE ${idx + 1}/${TEMPLATE_NAMES.length}] ` + applyPlaceholders(template.subject, FAKE_FULL_NAME);

    const bodyHtml = stripOuterWrapper(rawHtml);
    const finalHtml = wrapInBrandTemplate(bodyHtml, unsubUrl);

    try {
      const result = await resend.emails.send({
        from: FROM,
        to: RECIPIENT,
        subject,
        html: finalHtml,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      const messageId = result.data?.id || '(no id)';
      console.log(`✅ [${idx + 1}/${TEMPLATE_NAMES.length}] "${name}"  →  ${messageId}`);
      console.log(`    subject: ${subject}`);
      sent++;
    } catch (err: any) {
      console.error(`🔴 [${idx + 1}/${TEMPLATE_NAMES.length}] "${name}" FALHOU: ${err?.message || err}`);
      failed++;
    }

    // Delay entre envios (2s) pra respeitar rate limit do Resend
    if (idx < TEMPLATE_NAMES.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log('\n────────────────────────────────────────');
  console.log(`Enviados: ${sent}  |  Falharam: ${failed}`);
  console.log(`\nConfira a caixa de ${RECIPIENT} — devem chegar ${sent} emails com prefixo [TESTE].`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
