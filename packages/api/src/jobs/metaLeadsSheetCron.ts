import cron from 'node-cron';
import { randomBytes } from 'node:crypto';
import prisma from '../lib/prisma';
import { readSheetValues } from '../services/googleSheets';

/**
 * Sync de leads dos Instant Forms do Meta via planilha Google ("BGP - Leads - meta").
 *
 * Ponte temporária enquanto a integração direta com o leadgen webhook do Meta
 * não existe: o Meta despeja cada lead do formulário na planilha, e este job
 * puxa as linhas novas e injeta cada uma no fluxo normal de lead do CRM
 * (POST no próprio endpoint de webhook incoming — reaproveita dedup por
 * email/telefone, Source, Campaign, LeadTracking, notificações e qualificação).
 *
 * Env:
 *   META_LEADS_SHEET_ID   — id da planilha (obrigatório; sem ele o job não roda)
 *   GOOGLE_SHEETS_SA_KEY  — chave JSON do service account (ver googleSheets.ts)
 *
 * Controle de processados: tabela MetaFormLead (leadgenId único = coluna "id"
 * da planilha, ex. "l:123..."). Linha com falha no POST não é gravada — será
 * retentada no ciclo seguinte.
 */

const WEBHOOK_CONFIG_NAME = 'Meta Instant Forms (planilha)';

// Colunas da planilha (header gerado pelo próprio Meta). Aliases minúsculos.
const COLUMN_ALIASES: Record<string, string[]> = {
  id: ['id'],
  createdTime: ['created_time'],
  name: ['nome_completo', 'full_name', 'nome'],
  email: ['email'],
  phone: ['número_do_whatsapp', 'numero_do_whatsapp', 'telefone', 'phone_number', 'whatsapp'],
  company: ['nome_da_empresa', 'company_name', 'empresa'],
  campaignName: ['campaign_name'],
  adsetName: ['adset_name'],
  adName: ['ad_name'],
  platform: ['platform'],
  isOrganic: ['is_organic'],
};

function pick(row: Record<string, string>, field: keyof typeof COLUMN_ALIASES): string | undefined {
  for (const alias of COLUMN_ALIASES[field]) {
    const value = row[alias]?.trim();
    if (value) return value;
  }
  return undefined;
}

// Leads de teste do Meta chegam com valores "<test lead: dummy data for ...>"
function isTestLead(row: Record<string, string>): boolean {
  return Object.values(row).some((v) => v.toLowerCase().startsWith('<test lead')) ||
    row['email']?.toLowerCase() === 'test@meta.com';
}

async function ensureWebhookConfig() {
  const existing = await prisma.webhookConfig.findFirst({
    where: { name: WEBHOOK_CONFIG_NAME, type: 'INCOMING' },
  });
  if (existing) return existing;

  return prisma.webhookConfig.create({
    data: {
      name: WEBHOOK_CONFIG_NAME,
      url: 'internal:meta-leads-sheet',
      type: 'INCOMING',
      events: ['lead.created'],
      secret: randomBytes(24).toString('hex'),
      isActive: true,
    },
  });
}

export async function runMetaLeadsSheetSync(): Promise<{ scanned: number; created: number; skippedTest: number; failed: number } | { skipped: string }> {
  const sheetId = process.env.META_LEADS_SHEET_ID;
  if (!sheetId || !process.env.GOOGLE_SHEETS_SA_KEY) {
    return { skipped: 'META_LEADS_SHEET_ID/GOOGLE_SHEETS_SA_KEY não configurados' };
  }

  const rows = await readSheetValues(sheetId, 'A1:Z');
  if (rows === null) return { skipped: 'falha ao ler a planilha' };
  if (rows.length < 2) return { scanned: 0, created: 0, skippedTest: 0, failed: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((col, i) => { row[col] = cells[i] ?? ''; });
    return row;
  }).filter((row) => pick(row, 'id'));

  if (dataRows.length === 0) return { scanned: 0, created: 0, skippedTest: 0, failed: 0 };

  const allIds = dataRows.map((row) => pick(row, 'id') as string);
  const processed = await prisma.metaFormLead.findMany({
    where: { leadgenId: { in: allIds } },
    select: { leadgenId: true },
  });
  const processedIds = new Set(processed.map((p) => p.leadgenId));
  const fresh = dataRows.filter((row) => !processedIds.has(pick(row, 'id') as string));

  if (fresh.length === 0) return { scanned: dataRows.length, created: 0, skippedTest: 0, failed: 0 };

  const config = await ensureWebhookConfig();
  const port = process.env.PORT ?? '3001';
  let created = 0;
  let skippedTest = 0;
  let failed = 0;

  for (const row of fresh) {
    const leadgenId = pick(row, 'id') as string;

    if (isTestLead(row)) {
      await prisma.metaFormLead.create({ data: { leadgenId, raw: row } });
      skippedTest += 1;
      console.log(`[meta-leads-sheet] Lead de teste do Meta ignorado (${leadgenId})`);
      continue;
    }

    const body: Record<string, string | undefined> = {
      name: pick(row, 'name'),
      email: pick(row, 'email'),
      phone: pick(row, 'phone'),
      company: pick(row, 'company'),
      source: 'Meta Instant Form',
      utm_source: pick(row, 'platform') ?? 'meta',
      utm_medium: 'instant-form',
      utm_campaign: pick(row, 'campaignName'),
      utm_content: pick(row, 'adsetName'),
      utm_term: pick(row, 'adName'),
    };

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/incoming/${config.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.secret ? { 'x-webhook-secret': config.secret } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const result = (await res.json()) as { contactId?: string; dealId?: string };
      await prisma.metaFormLead.create({
        data: {
          leadgenId,
          contactId: result.contactId ?? null,
          dealId: result.dealId ?? null,
          raw: row,
        },
      });
      created += 1;
      console.log(`[meta-leads-sheet] Lead criado: ${body.name} (${leadgenId}) → deal ${result.dealId}`);
    } catch (err) {
      failed += 1;
      console.error(`[meta-leads-sheet] Falha ao processar ${leadgenId} (retenta no próximo ciclo):`, err);
    }
  }

  return { scanned: dataRows.length, created, skippedTest, failed };
}

let running = false;

export function startMetaLeadsSheetCron() {
  if (!process.env.META_LEADS_SHEET_ID || !process.env.GOOGLE_SHEETS_SA_KEY) {
    console.log('[meta-leads-sheet] Desativado — META_LEADS_SHEET_ID/GOOGLE_SHEETS_SA_KEY não configurados');
    return;
  }

  cron.schedule('*/5 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      const result = await runMetaLeadsSheetSync();
      if ('created' in result && (result.created > 0 || result.failed > 0 || result.skippedTest > 0)) {
        console.log('[meta-leads-sheet] Ciclo concluído:', result);
      }
    } catch (err) {
      console.error('[meta-leads-sheet] Erro no ciclo:', err);
    } finally {
      running = false;
    }
  });
  console.log('[meta-leads-sheet] Agendado: a cada 5min (cron */5 * * * *)');
}
