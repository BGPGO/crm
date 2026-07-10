/**
 * biaMonthlyReport — relatório mensal automático da BIA.
 *
 * Fluxo (cron dia 7 de cada mês, 8h BRT — jobs/biaMonthlyReportCron.ts):
 *   1. Calcula os números canônicos da janela [dia 7 → dia 7) + mês anterior (MoM)
 *   2. IA (OpenAI) escreve resumo executivo, 3 ações, FODA e sugestões
 *   3. Envia o email pros sócios via Resend
 *   4. Cria demanda de checagem no FinHub pro Oliver (REST Supabase; no-op sem env)
 *
 * Envs:
 *   BIA_REPORT_EMAILS            — destinatários (vírgula); default sócios
 *   BIA_REPORT_AI_MODEL          — default gpt-4o
 *   FINHUB_SUPABASE_URL          — ex: https://pbtheffdoebfryttkyge.supabase.co
 *   FINHUB_SUPABASE_SERVICE_KEY  — service_role (a tabela demands tem RLS)
 */
import { Resend } from 'resend';
import {
  collectCadenceStats,
  collectMetrics,
  collectSamples,
  collectTemplateStats,
  computeWindows,
  windowLabel,
  windowShortLabel,
} from './metrics';
import { generateAnalysis } from './analysis';
import { buildBiaMonthlyReportHtml } from './builder';

const REPORT_FROM = 'BIA — BGPGO <noreply@bertuzzipatrimonial.app.br>';
const DEFAULT_RECIPIENTS = [
  'oliver@bertuzzipatrimonial.com.br',
  'joao.lopes@bertuzzipatrimonial.com.br',
  'vitor@bertuzzipatrimonial.com.br',
];

// FinHub (padrão do Oliver pra demandas — ver memória do workspace)
const FINHUB_CLIENT_BGP = 'ee3da1e0-8089-4da5-96a6-11da8045ed57';
const FINHUB_PROJECT_VENDAS = 'b61a5d44-3680-4bbd-8893-31bb785b65c3';
const FINHUB_ASSIGNEE_OLIVER = 'aff0dba8-4ad1-4dcd-92f0-d1107da6e3a2';

export interface RunBiaMonthlyReportResult {
  html: string;
  sent: boolean;
  emailId: string | null;
  finhubDemandId: string | null;
  periodLabel: string;
}

export async function runBiaMonthlyReport(opts?: {
  dryRun?: boolean;
  now?: Date;
  recipients?: string[];
}): Promise<RunBiaMonthlyReportResult> {
  const now = opts?.now ?? new Date();
  const { current, previous } = computeWindows(now);
  const periodLabel = windowLabel(current);
  console.log(`[bia-monthly-report] Janela: ${current.start.toISOString()} → ${current.end.toISOString()}`);

  const [cur, prev, cadence, templates] = await Promise.all([
    collectMetrics(current),
    collectMetrics(previous),
    collectCadenceStats(current),
    collectTemplateStats(current),
  ]);
  console.log(
    `[bia-monthly-report] Métricas: ${cur.conversations} conversas, ${cur.responded} responderam, ` +
      `${cur.meetingsAttributed} reuniões, ${cur.incidents.length} incidente(s)`,
  );

  const samples = await collectSamples(current, cur.outlierConversationIds);
  const analysis = await generateAnalysis(cur, prev, cadence, templates, samples, periodLabel);
  const html = buildBiaMonthlyReportHtml({ current: cur, previous: prev, analysis, cadence, templates, periodLabel });

  if (opts?.dryRun) {
    return { html, sent: false, emailId: null, finhubDemandId: null, periodLabel };
  }

  // 3) Email
  const resend = new Resend(process.env.RESEND_API_KEY);
  const recipients =
    opts?.recipients ??
    (process.env.BIA_REPORT_EMAILS
      ? process.env.BIA_REPORT_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)
      : DEFAULT_RECIPIENTS);

  const { data, error } = await resend.emails.send({
    from: REPORT_FROM,
    to: recipients,
    subject: `BIA — Análise do Mês · ${periodLabel}`,
    html,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  console.log(`[bia-monthly-report] Email enviado (${data?.id}) para ${recipients.join(', ')}`);

  // 4) Demanda de checagem no FinHub (não-bloqueante — email já saiu)
  const finhubDemandId = await createFinhubCheckDemand(windowShortLabel(current), now);

  return { html, sent: true, emailId: data?.id ?? null, finhubDemandId, periodLabel };
}

/**
 * Cria a demanda "checar o relatório" pro Oliver no FinHub via REST do Supabase.
 * Idempotente por título (uma por mês). Falha aqui é logada e engolida.
 */
async function createFinhubCheckDemand(shortLabel: string, now: Date): Promise<string | null> {
  const url = process.env.FINHUB_SUPABASE_URL;
  const key = process.env.FINHUB_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn('[bia-monthly-report] FINHUB_SUPABASE_URL/SERVICE_KEY ausentes — demanda não criada');
    return null;
  }

  const title = `Checar relatório mensal da BIA (${shortLabel}) e definir ajustes`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  const withTimeout = async (run: (signal: AbortSignal) => Promise<Response>): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      return await run(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    // Dedup: já existe a demanda deste mês?
    const dedupRes = await withTimeout((signal) =>
      fetch(`${url}/rest/v1/demands?select=id&title=eq.${encodeURIComponent(title)}&limit=1`, {
        headers,
        signal,
      }),
    );
    if (dedupRes.ok) {
      const existing = (await dedupRes.json()) as Array<{ id: string }>;
      if (existing.length) {
        console.log(`[bia-monthly-report] Demanda FinHub já existe (${existing[0].id}) — não duplicada`);
        return existing[0].id;
      }
    }

    // due_date = hoje em BRT (date-only, padrão do FinHub)
    const brt = new Date(now.getTime() - 3 * 3_600_000);
    const dueDate = brt.toISOString().slice(0, 10);

    const res = await withTimeout((signal) =>
      fetch(`${url}/rest/v1/demands`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        signal,
        body: JSON.stringify({
        title,
        demand_type_new: 'interna',
        priority: 'medium',
        status: 'in_progress',
        client_id: FINHUB_CLIENT_BGP,
        project_id: FINHUB_PROJECT_VENDAS,
        assignee_id: FINHUB_ASSIGNEE_OLIVER,
        due_date: dueDate,
        client_visible: false,
        observations:
          `Relatório mensal da BIA enviado automaticamente por email pra Oliver, João Lopes e Vitor. ` +
          `Conferir os números e a análise, e decidir os ajustes do mês (tela da BIA, templates e mudanças de código). ` +
          `Gerado pelo CRM (bia-monthly-report, cron dia 7).`,
        }),
      }),
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[bia-monthly-report] FinHub HTTP ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }
    const rows = (await res.json()) as Array<{ id: string }>;
    const id = rows[0]?.id ?? null;
    console.log(`[bia-monthly-report] Demanda de checagem criada no FinHub (${id})`);
    return id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bia-monthly-report] Falha ao criar demanda no FinHub: ${msg}`);
    return null;
  }
}
