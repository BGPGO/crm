/**
 * Auditoria: deals no-show — quais estão sendo tratados pela cadência?
 *
 * Pra cada deal com noShow=true:
 *   1. Tem tag "no-show" aplicada ao contato?
 *   2. Tem enrollment ativo (ou recente) na Cadência No-Show?
 *   3. Tem WaConversation vinculada ao contato?
 *   4. WaConversation tem dealId apontando pra esse deal?
 *
 * Uso: tsx src/seeds/auditNoShowDeals.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { phoneVariants } from '../utils/phoneNormalize';

const prisma = new PrismaClient();

const NO_SHOW_TAG = 'no-show';
const AUTOMATION_NAME = 'Cadência No-Show — BGP';

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  AUDIT — Deals com noShow=true');
  console.log('═══════════════════════════════════════════════════════\n');

  // 1. Carregar tag no-show + automation
  const tag = await prisma.tag.findUnique({ where: { name: NO_SHOW_TAG } });
  const automation = await prisma.automation.findFirst({ where: { name: AUTOMATION_NAME } });

  if (!tag) {
    console.error('Tag "no-show" não encontrada — rode seed:no-show-cadence primeiro.');
    return;
  }
  if (!automation) {
    console.error('Automation "Cadência No-Show — BGP" não encontrada.');
    return;
  }
  console.log(`Tag id=${tag.id}`);
  console.log(`Automation id=${automation.id} status=${automation.status}\n`);

  // 2. Carregar deals no-show
  const deals = await prisma.deal.findMany({
    where: { noShow: true },
    orderBy: { noShowAt: 'desc' },
    include: {
      contact: { select: { id: true, name: true, email: true, phone: true, brand: true } },
      stage: { select: { name: true } },
      pipeline: { select: { name: true, brand: true } },
    },
  });

  console.log(`Total de deals com noShow=true: ${deals.length}\n`);

  // Estatísticas
  let comTag = 0;
  let semTag = 0;
  let comEnrollAtivo = 0;
  let comEnrollCompleted = 0;
  let semEnroll = 0;
  let comWaConvDoDeal = 0;
  let comWaConvSoContato = 0;
  let semWaConv = 0;
  let semContato = 0;

  const issues: Array<{ dealId: string; deal: string; problemas: string[] }> = [];

  for (const deal of deals) {
    const problemas: string[] = [];

    if (!deal.contact) {
      problemas.push('Sem contato vinculado');
      semContato++;
      issues.push({ dealId: deal.id, deal: deal.title, problemas });
      continue;
    }

    // Tag aplicada?
    const hasTag = await prisma.contactTag.findFirst({
      where: { contactId: deal.contact.id, tagId: tag.id },
    });
    if (hasTag) comTag++;
    else {
      semTag++;
      problemas.push('Sem tag "no-show" aplicada');
    }

    // Enrollment?
    const enrollments = await prisma.automationEnrollment.findMany({
      where: { contactId: deal.contact.id, automationId: automation.id },
      orderBy: { enrolledAt: 'desc' },
      take: 5,
    });
    const ativo = enrollments.find((e) => e.status === 'ACTIVE');
    const concluido = enrollments.find((e) => e.status === 'COMPLETED');

    if (ativo) comEnrollAtivo++;
    else if (concluido) comEnrollCompleted++;
    else {
      semEnroll++;
      problemas.push('Sem enrollment na Cadência No-Show');
    }

    // WaConversation? (sem dealId no schema — vínculo é por phone/contactId)
    if (deal.contact.phone) {
      const variants = phoneVariants(deal.contact.phone);
      const convs = await prisma.waConversation.findMany({
        where: { phone: { in: variants } },
        select: { id: true, contactId: true, phone: true, status: true },
      });
      if (convs.length === 0) {
        semWaConv++;
        problemas.push('Sem WaConversation com esse telefone');
      } else {
        const linkadoNoContato = convs.find((c) => c.contactId === deal.contact!.id);
        if (linkadoNoContato) comWaConvDoDeal++;
        else {
          comWaConvSoContato++;
          problemas.push(
            `WaConversation existe (phone bate) mas contactId NÃO bate. ` +
            `convs: ${convs.map(c => `${c.id}(contact=${c.contactId ?? 'null'})`).join(', ')}`
          );
        }
      }
    } else {
      semWaConv++;
      problemas.push('Contato sem telefone — sem como vincular WaConversation');
    }

    if (problemas.length > 0) {
      issues.push({ dealId: deal.id, deal: deal.title, problemas });
    }
  }

  console.log('┌──────────────────────────────────────────┬────────┐');
  console.log('│ Métrica                                  │  Qtd   │');
  console.log('├──────────────────────────────────────────┼────────┤');
  console.log(`│ Total deals no-show                      │ ${String(deals.length).padStart(6)} │`);
  console.log(`│ Sem contato vinculado                    │ ${String(semContato).padStart(6)} │`);
  console.log(`│ Com tag "no-show" aplicada               │ ${String(comTag).padStart(6)} │`);
  console.log(`│ Sem tag "no-show"                        │ ${String(semTag).padStart(6)} │`);
  console.log(`│ Com enrollment ATIVO na cadência         │ ${String(comEnrollAtivo).padStart(6)} │`);
  console.log(`│ Com enrollment COMPLETED na cadência     │ ${String(comEnrollCompleted).padStart(6)} │`);
  console.log(`│ Sem enrollment                           │ ${String(semEnroll).padStart(6)} │`);
  console.log(`│ WaConversation vinculada ao deal (dealId)│ ${String(comWaConvDoDeal).padStart(6)} │`);
  console.log(`│ WaConversation só por contactId (orfã)   │ ${String(comWaConvSoContato).padStart(6)} │`);
  console.log(`│ Sem WaConversation                       │ ${String(semWaConv).padStart(6)} │`);
  console.log('└──────────────────────────────────────────┴────────┘\n');

  // Listar issues (top 20)
  if (issues.length > 0) {
    console.log(`▸ Deals com problema (top 20 de ${issues.length}):\n`);
    for (const it of issues.slice(0, 20)) {
      console.log(`  • ${it.deal} (id=${it.dealId})`);
      for (const p of it.problemas) console.log(`      - ${p}`);
    }
    if (issues.length > 20) console.log(`\n  ... e mais ${issues.length - 20} deals com problema.`);
  } else {
    console.log('✅ Todos deals no-show estão corretamente tratados.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
