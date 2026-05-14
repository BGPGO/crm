/**
 * Retomar 5 enrollments INCIDENT_CLEANUP_2026_05_13 da Marcar Reunião que
 * tinham engajamento real, + opt-out dos 2 frios da mesma cadência.
 *
 * Decisão 2026-05-14: após verificar que os 5 engajaram antes da pausa,
 * eles merecem continuar a cadência (agora com templates v2 renovados).
 *
 * Staggered: nextActionAt espaçado 10 min entre cada pra evitar rajada
 * de 5 envios simultâneos.
 */

import prisma from '../lib/prisma';

const TO_RESUME = [
  { name: 'Allan Tsuneo', phoneEnding: '957288487' },
  { name: 'Leandro Bolzan', phoneEnding: '982849777' },
  { name: 'João (68)', phoneEnding: '999773352' },
  { name: 'Luciene Silva', phoneEnding: '991404815' },
  { name: 'Carla Mumique', phoneEnding: '991143020' },
];

const TO_OPTOUT = [
  { name: 'Pedro Henrique', phoneEnding: '983248932', reason: 'never_responded_1_err131049' },
  { name: 'Vagner da Silva', phoneEnding: '986789749', reason: 'autoreply_only_2_err131049' },
];

const MR_AUTOMATION_ID = 'cmnfj0071000013sor2cblyyh';
const DEACTIVATED_AT = new Date().toISOString();

async function main() {
  console.log('═══ Retomar 5 + opt-out 2 ═══\n');

  // ── Retomar 5 ──
  let idx = 0;
  for (const t of TO_RESUME) {
    const phone = `%${t.phoneEnding.slice(-9)}`;
    const conv = await prisma.waConversation.findFirst({
      where: { phone: { contains: t.phoneEnding.slice(-9) } },
      select: { contactId: true, phone: true },
    });
    if (!conv?.contactId) {
      console.log(`⚠️  ${t.name}: sem conversa/contactId`);
      continue;
    }
    const enrolls = await prisma.automationEnrollment.findMany({
      where: {
        contactId: conv.contactId,
        automationId: MR_AUTOMATION_ID,
        status: 'PAUSED',
      },
    });
    const incident = enrolls.find((e) => {
      const meta = (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata))
        ? (e.metadata as Record<string, unknown>)
        : {};
      return meta.pausedBy === 'INCIDENT_CLEANUP_2026_05_13';
    });
    if (!incident) {
      console.log(`⚠️  ${t.name}: sem enrollment INCIDENT_CLEANUP — pulando`);
      continue;
    }
    const meta = (incident.metadata && typeof incident.metadata === 'object' && !Array.isArray(incident.metadata))
      ? (incident.metadata as Record<string, unknown>)
      : {};
    const nextAt = new Date(Date.now() + (idx + 1) * 10 * 60 * 1000); // +10min, +20min, +30min...
    await prisma.automationEnrollment.update({
      where: { id: incident.id },
      data: {
        status: 'ACTIVE',
        nextActionAt: nextAt,
        metadata: {
          ...meta,
          resumedBy: 'INCIDENT_REASSESSMENT_2026_05_14',
          resumedAt: DEACTIVATED_AT,
          resumedReason: 'lead_engaged_before_pause',
        },
      },
    });
    console.log(`✓ ${t.name} (${conv.phone}): PAUSED → ACTIVE  nextActionAt=${nextAt.toISOString().slice(11, 16)}`);
    idx++;
  }

  // ── Opt-out 2 ──
  console.log('\n--- Opt-out ---');
  for (const t of TO_OPTOUT) {
    const conv = await prisma.waConversation.findFirst({
      where: { phone: { contains: t.phoneEnding.slice(-9) } },
      select: { id: true, contactId: true, phone: true, optedOut: true },
    });
    if (!conv) {
      console.log(`⚠️  ${t.name}: sem conversa`);
      continue;
    }
    if (!conv.optedOut) {
      await prisma.waConversation.update({
        where: { id: conv.id },
        data: { optedOut: true, optedOutAt: new Date(), status: 'WA_CLOSED' },
      });
      console.log(`✓ ${t.name} (${conv.phone}): WaConversation optedOut + WA_CLOSED`);
    }
    // Z-API legacy se houver
    const zap = await prisma.whatsAppConversation.findFirst({
      where: { phone: { contains: t.phoneEnding.slice(-9) } },
    });
    if (zap && !zap.optedOut) {
      await prisma.whatsAppConversation.update({
        where: { id: zap.id },
        data: { optedOut: true, optedOutAt: new Date(), status: 'closed' },
      });
      console.log(`  + WhatsAppConversation (Z-API) também optedOut`);
    }
    // Enrollments do contato → COMPLETED
    if (conv.contactId) {
      const ens = await prisma.automationEnrollment.findMany({
        where: { contactId: conv.contactId, status: { in: ['ACTIVE', 'PAUSED'] } },
      });
      for (const e of ens) {
        const m = (e.metadata && typeof e.metadata === 'object' && !Array.isArray(e.metadata))
          ? (e.metadata as Record<string, unknown>) : {};
        await prisma.automationEnrollment.update({
          where: { id: e.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            metadata: {
              ...m,
              deactivatedBy: 'COLD_CONTACT_CLEANUP_2026_05_14',
              deactivatedAt: DEACTIVATED_AT,
              deactivatedReason: t.reason,
              previousStatus: e.status,
            },
          },
        });
        console.log(`  ✓ Enrollment ${e.id.slice(0, 14)} → COMPLETED`);
      }
    }
  }

  console.log('\n✓ Concluído. 5 retomados (staggered 10min cada), 2 desligados.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
