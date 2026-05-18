/**
 * deleteOrphanTemplates_2026_05_18.ts
 *
 * Deleta 5 templates Cloud API órfãos (REJECTED + DISABLED) que foram auditados
 * e confirmados como sem uso em automações, enrollments ou broadcasts ativos.
 *
 * Execução: npx tsx src/scripts/deleteOrphanTemplates_2026_05_18.ts
 */

import prisma from '../lib/prisma';
import { WhatsAppCloudClient } from '../services/whatsappCloudClient';

const TEMPLATES_PARA_DELETAR = [
  'marcar_reuniao_abertura_v1',
  'mr_d1_abertura_v3',
  'mr_d1_abertura_v4',
  'mr_d1_abertura_v5',
  'cadencia_d4_prova_v2',
] as const;

async function main() {
  console.log('=== Cleanup de Templates Órfãos — 2026-05-18 ===');
  console.log(`Templates alvo: ${TEMPLATES_PARA_DELETAR.length}`);
  console.log('');

  let client: WhatsAppCloudClient;
  try {
    client = await WhatsAppCloudClient.fromDB();
    console.log('[Init] Client Meta carregado com sucesso.');
  } catch (err: any) {
    console.error('[Init] ERRO ao carregar client Meta:', err.message);
    process.exit(1);
  }

  let deletadosMeta = 0;
  let errosMeta = 0;
  let deletadosDB = 0;
  let errosDB = 0;

  for (const name of TEMPLATES_PARA_DELETAR) {
    console.log(`\n--- Template: ${name} ---`);

    // 1. Verifica existência no banco antes de deletar
    const registro = await prisma.cloudWaTemplate.findFirst({
      where: { name },
    });

    if (!registro) {
      console.log(`[DB] Template "${name}" não encontrado no banco — pode já ter sido deletado. Pulando.`);
      continue;
    }

    console.log(`[DB] Encontrado — id: ${registro.id}, status: ${registro.status}`);

    // 2. Deleta na Meta (tenta, mas segue mesmo se já não existir lá)
    try {
      const metaResult = await client.deleteTemplate(name);
      console.log(`[Meta] OK — resposta: ${JSON.stringify(metaResult)}`);
      deletadosMeta++;
    } catch (err: any) {
      const code = (err as any).metaCode ?? '?';
      const msg = err.message ?? String(err);
      console.warn(`[Meta] ERR ${code} — ${msg}`);
      // Códigos que indicam "template já não existe" na Meta — segue para deletar no DB
      const naoExiste = [
        'does not exist',
        'not found',
        'Invalid parameter',
        '100',
      ];
      const ehNaoExiste = naoExiste.some(s => msg.toLowerCase().includes(s.toLowerCase()));
      if (ehNaoExiste) {
        console.log('[Meta] Template provavelmente já removido da Meta. Prosseguindo com remoção no DB.');
      } else {
        console.error(`[Meta] Erro inesperado para "${name}". Abortando deleção no DB para este template por segurança.`);
        errosMeta++;
        continue;
      }
      errosMeta++;
    }

    // 3. Deleta no banco (targeted — nunca deleteMany sem where)
    try {
      await prisma.cloudWaTemplate.delete({
        where: { id: registro.id },
      });
      console.log(`[DB] OK — template "${name}" removido do banco.`);
      deletadosDB++;
    } catch (err: any) {
      console.error(`[DB] ERRO ao deletar "${name}":`, err.message);
      errosDB++;
    }
  }

  // 4. Resumo
  console.log('\n=== Resumo ===');
  console.log(`Meta: ${deletadosMeta} deletados, ${errosMeta} com erro/já removidos`);
  console.log(`DB:   ${deletadosDB} deletados, ${errosDB} com erro`);

  // 5. Verificação pós-execução
  console.log('\n=== Verificação pós-execução ===');
  const restantes = await prisma.cloudWaTemplate.findMany({
    where: { name: { in: [...TEMPLATES_PARA_DELETAR] } },
    select: { id: true, name: true, status: true },
  });

  if (restantes.length === 0) {
    console.log('Confirmado: nenhum dos 5 templates existe mais no banco.');
  } else {
    console.warn(`ATENÇÃO: ${restantes.length} template(s) ainda no banco:`);
    for (const t of restantes) {
      console.warn(`  - ${t.name} (id: ${t.id}, status: ${t.status})`);
    }
  }

  await prisma.$disconnect();
  console.log('\nConexão com o banco encerrada. Cleanup concluído.');
}

main().catch(async (err) => {
  console.error('Erro fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
