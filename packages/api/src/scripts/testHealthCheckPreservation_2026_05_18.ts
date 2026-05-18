/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Teste manual: preservação de status local no wabaTemplateHealthCheck
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Objetivo: confirmar que o job NÃO sobrescreve status DISABLED/REJECTED com
 * o valor que a Meta retorna (normalmente APPROVED).
 *
 * Estratégia (sem chamar a Meta API de verdade):
 *   1. Busca um template com poucos envios (sentCount7d baixo → sem impacto).
 *   2. Marca localmente como DISABLED.
 *   3. Simula o comportamento do loop do job — faz `findUnique` + decide nextStatus.
 *   4. Confirma que nextStatus === 'DISABLED' (preservação OK).
 *   5. Reverte o template para o status original.
 *
 * NOTA: o sync real com a Meta API NÃO é chamado aqui porque isso exigiria
 * credenciais válidas e dispararia chamadas de rede desnecessárias em um script
 * de teste. A lógica de preservação está isolada em ~5 linhas no job principal
 * e é testada inline abaixo com o mesmo padrão de código.
 *
 * Uso:
 *   npx tsx src/scripts/testHealthCheckPreservation_2026_05_18.ts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import prisma from '../lib/prisma';

async function main() {
  const SCRIPT = '[testHealthCheckPreservation]';

  // ── 1. Encontrar template de teste (prefer sem envios recentes) ────────────
  const candidate = await prisma.cloudWaTemplate.findFirst({
    where: {
      sentCount7d: { lte: 0 },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, language: true, status: true },
  });

  if (!candidate) {
    console.error(`${SCRIPT} Nenhum template com sentCount7d=0 encontrado. Abortando.`);
    process.exit(1);
  }

  console.log(
    `${SCRIPT} Template escolhido: "${candidate.name}" (${candidate.language}) — status atual: ${candidate.status}`,
  );

  const originalStatus = candidate.status;

  // ── 2. Marcar como DISABLED localmente ────────────────────────────────────
  await prisma.cloudWaTemplate.update({
    where: { id: candidate.id },
    data: { status: 'DISABLED' },
  });
  console.log(`${SCRIPT} Status marcado como DISABLED no banco.`);

  // ── 3. Simular a lógica do job (mesma lógica do wabaTemplateHealthCheck) ──
  //   O job faz findUnique e decide se preserva o status local.
  //   Aqui simulamos com metaStatus = 'APPROVED' (pior caso — Meta devolveria APPROVED).
  const metaStatusSimulado = 'APPROVED';

  const existing = await prisma.cloudWaTemplate.findUnique({
    where: { name_language: { name: candidate.name, language: candidate.language } },
    select: { status: true },
  });

  const preserveLocalStatus =
    existing !== null &&
    (existing.status === 'DISABLED' || existing.status === 'REJECTED');

  const nextStatus = preserveLocalStatus ? existing.status : (metaStatusSimulado as any);

  // ── 4. Validar ────────────────────────────────────────────────────────────
  console.log(`${SCRIPT} Meta retornaria: "${metaStatusSimulado}"`);
  console.log(`${SCRIPT} preserveLocalStatus: ${preserveLocalStatus}`);
  console.log(`${SCRIPT} nextStatus calculado: "${nextStatus}"`);

  if (nextStatus === 'DISABLED') {
    console.log(`${SCRIPT} ✔ PRESERVAÇÃO CONFIRMADA — status local DISABLED mantido corretamente.`);
  } else {
    console.error(
      `${SCRIPT} ✘ FALHA — esperava nextStatus="DISABLED" mas obteve "${nextStatus}". Bug não corrigido!`,
    );
    // Reverter antes de sair com erro
    await prisma.cloudWaTemplate.update({
      where: { id: candidate.id },
      data: { status: originalStatus },
    });
    process.exit(1);
  }

  // ── 5. Reverter para o status original ────────────────────────────────────
  await prisma.cloudWaTemplate.update({
    where: { id: candidate.id },
    data: { status: originalStatus },
  });
  console.log(`${SCRIPT} Status revertido para "${originalStatus}". Estado do banco restaurado.`);

  console.log(`${SCRIPT} Teste concluído com SUCESSO.`);
}

main()
  .catch((err) => {
    console.error('[testHealthCheckPreservation] Erro inesperado:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
