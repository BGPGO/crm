/**
 * finhubBridge — sinaliza o FinHub a cada etapa do contrato (modelo PUSH).
 *
 * O webhook do Autentique aponta pro CRM; o CRM processa o ciclo e empurra
 * cada etapa pro FinHub, que ingere (edge function `ingest-crm-contract`).
 *
 * - Não-bloqueante: qualquer falha aqui é logada e engolida; NUNCA quebra o
 *   fluxo de contrato do CRM (assinatura, mudança de etapa, notificação).
 * - Config por env: FINHUB_INGEST_URL + CRM_INGEST_SECRET. Se faltar, no-op.
 *
 * O mapeamento produto CRM -> product_name FinHub vive no FinHub (ele é dono do
 * vocabulário). Aqui mandamos `produto` cru do contrato.
 */

export type ContractStage = "created" | "sent" | "signature" | "signed";

// Aceita o Contract do Prisma (campos podem vir como Decimal/Date/null).
interface ContractLike {
  id: string;
  autentiqueDocumentId?: string | null;
  isTest?: boolean | null;
  cnpj?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  emailFinanceiro?: string | null;
  emailRepresentante?: string | null;
  produto?: string | null;
  valorMensal?: unknown; // Prisma Decimal | number | string | null
  valorImplementacao?: unknown; // setup / implementação (one-time)
  implementacaoParcelas?: number | null;
  deal?: {
    contact?: { phone?: string | null } | null;
    organization?: { phone?: string | null } | null;
  } | null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v as { toString(): string });
  return Number.isFinite(n) ? n : null;
}

export async function signalFinhubContractStage(
  stage: ContractStage,
  contract: ContractLike,
  extra?: { autentiqueDocumentId?: string | null },
): Promise<void> {
  const url = process.env.FINHUB_INGEST_URL;
  const secret = process.env.CRM_INGEST_SECRET;
  if (!url || !secret) {
    console.warn("[finhubBridge] FINHUB_INGEST_URL/CRM_INGEST_SECRET ausentes — sinal não enviado");
    return;
  }

  const payload = {
    stage,
    crmContractId: contract.id,
    autentiqueDocumentId: extra?.autentiqueDocumentId ?? contract.autentiqueDocumentId ?? null,
    isTest: !!contract.isTest,
    cnpj: contract.cnpj ?? null,
    razaoSocial: contract.razaoSocial ?? null,
    nomeFantasia: contract.nomeFantasia ?? null,
    emailFinanceiro: contract.emailFinanceiro ?? null,
    emailRepresentante: contract.emailRepresentante ?? null,
    telefone: contract.deal?.contact?.phone ?? contract.deal?.organization?.phone ?? null,
    produto: contract.produto ?? null,
    valorMensal: toNumber(contract.valorMensal),
    valorImplementacao: toNumber(contract.valorImplementacao),
    implementacaoParcelas: contract.implementacaoParcelas ?? null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-crm-secret": secret },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[finhubBridge] HTTP ${res.status} (stage=${stage}, contract=${contract.id}): ${body.slice(0, 300)}`);
    } else {
      console.log(`[finhubBridge] sinal '${stage}' enviado (contract=${contract.id})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[finhubBridge] falha ao sinalizar FinHub (stage=${stage}, contract=${contract.id}): ${msg}`);
  }
}
