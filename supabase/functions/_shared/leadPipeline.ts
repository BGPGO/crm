/**
 * Classificação do funil de um lead que está ENTRANDO — funil BI ou Controladoria.
 *
 * ⚠️ Este arquivo é o ESPELHO de `packages/api/src/lib/pipelines.ts`
 * (`resolveLeadPipeline`). O Deno das Edge Functions não importa do pacote da
 * API, então a regra existe duas vezes de propósito. **Mudou lá, mude aqui** —
 * duas réguas diferentes é como o lead de BI acabava no funil de Controladoria.
 *
 * Em 30/07/2026 o funil único "Vendas" foi separado: o ID original virou
 * "Controladoria" e os deals de BI foram para um funil novo.
 */

export const PIPELINE_CONTROLADORIA = "64fb7516ea4eb400219457de";
export const STAGE_LEAD_CONTROLADORIA = "64fb7516ea4eb400219457df";
export const PIPELINE_BI = "bi-pipeline-bgp";
export const STAGE_LEAD_BI = "bi-stage-1";

/**
 * Quem cuida do topo do funil: Gustavo no BI, Vicenza na Controladoria. Antes
 * TODO lead entrava como do Oliver, e era por isso que reunião do Henrique
 * aparecia como sendo dele.
 */
export const OWNER_BI = "usr-gustavo-sdr-bi";
export const OWNER_CONTROLADORIA = "68482c2582aa2e001bc07fd3"; // Vicenza Porto

/**
 * Funil de indicação (LP "BGP Indica") — atendimento humano: a Fernanda atende do
 * começo ao fim, e o lead não recebe BIA nem cadência. O bloqueio das automações
 * vive na API (`NO_AUTOMATION_PIPELINE_IDS`); aqui só o roteamento.
 */
export const PIPELINE_INDICACAO = "68a773827264cb001fd8316f";
export const STAGE_SEM_CONTATO_INDICACAO = "68a773827264cb001fd83171";
export const OWNER_INDICACAO = "663a71aaf689ef001afe68c6"; // Fernanda Brunisaki

/**
 * A regra é por TOKEN do path da LP, não por slug cadastrado: qualquer LP nova
 * com o produto no nome (`go-bi-bia`, `lp-bi-2027`…) entra sozinha, sem ninguém
 * ter de classificar LP por LP. Só `controladoria`/`valuation` são casados por
 * trecho, porque aparecem colados noutra palavra (`nova-gocontroladoria`).
 */
const BI_PATH_TOKENS = ["bi", "gobi", "bi2b"];
const CTRL_PATH_TRECHOS = ["controladoria", "valuation"];
/** Indicação vem antes: o slug traz a marca ("bgp-indica") e é o sinal mais específico. */
const INDICACAO_PATH_TOKENS = ["indica", "indicacao", "indique"];

export interface DestinoLead {
  pipelineId: string;
  stageId: string;
  pipelineName: string;
  ownerId: string;
  motivo: string;
}

/**
 * Decide o funil pelo link da landing page e, se ele não disser nada, pelo nome
 * da campanha.
 *
 * A LP vem primeiro porque é onde a pessoa preencheu o formulário — a URL diz o
 * produto. O nome da campanha é mais fraco: "Fluxo BI" e "Fluxo Controladoria"
 * são fluxos de automação do RD, não anúncios, e às vezes chega como template
 * não resolvido ("{{campaign.name}}").
 *
 * Sem nenhum sinal, vai para BI — decisão do Oliver em 30/07 para o resíduo
 * ambíguo. Para inverter, troque só o retorno final.
 */
export function resolveLeadPipeline(
  landingPage: string | null,
  campaign: string | null,
): DestinoLead {
  const bi = {
    pipelineId: PIPELINE_BI,
    stageId: STAGE_LEAD_BI,
    pipelineName: "BI",
    ownerId: OWNER_BI,
  };
  const controladoria = {
    pipelineId: PIPELINE_CONTROLADORIA,
    stageId: STAGE_LEAD_CONTROLADORIA,
    pipelineName: "Controladoria",
    ownerId: OWNER_CONTROLADORIA,
  };
  const indicacao = {
    pipelineId: PIPELINE_INDICACAO,
    stageId: STAGE_SEM_CONTATO_INDICACAO,
    pipelineName: "Indicação",
    ownerId: OWNER_INDICACAO,
  };

  // 1) Landing page. Aceita URL completa ou só o slug: tiramos protocolo, host
  // e query, e sobra o caminho — é dele que os tokens saem.
  if (landingPage) {
    const path = landingPage
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .split(/[?#]/)[0]
      .replace(/^[^/]*\//, ""); // remove o host quando ele existe

    const tokens = path.split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.some((t) => INDICACAO_PATH_TOKENS.includes(t))) {
      return { ...indicacao, motivo: `landingPage:${path}` };
    }
    if (CTRL_PATH_TRECHOS.some((t) => path.includes(t))) {
      return { ...controladoria, motivo: `landingPage:${path}` };
    }
    if (tokens.some((t) => BI_PATH_TOKENS.includes(t))) {
      return { ...bi, motivo: `landingPage:${path}` };
    }
  }

  // 2) Nome da campanha — "BI"/"FIN" como token, sem depender dos pipes (existe
  // `AZIFINICriativos-thomas-fernanda`, que é `AZ|FIN|` com os pipes apagados).
  if (campaign) {
    const c = campaign.trim().toLowerCase();
    if (/indica|indique/.test(c)) {
      return { ...indicacao, motivo: `campanha:${c}` };
    }
    if (/(^|[^a-z])bi([^a-z]|$)/.test(c) || c.startsWith("fluxo bi") || c.includes("aimo-bi")) {
      return { ...bi, motivo: `campanha:${c}` };
    }
    if (/(^|[^a-z])(fin|controladoria)([^a-z]|$)/.test(c) || c.startsWith("fluxo valuation")) {
      return { ...controladoria, motivo: `campanha:${c}` };
    }
    // Pipes apagados na importação: `AZ|FIN|Criativos-…` chegou como
    // `AZIFINICriativos-…` — um "i" no lugar de cada pipe, e aí `fin` fica
    // colado no meio da palavra e o teste por token não pega. Uma campanha
    // assim existe (a do Thomas/Fernanda); a regra é estreita de propósito,
    // porque `fin` solto dentro de palavra pegaria "finalizado", "definitivo".
    if (/^azi?(fin|controladoria)i/.test(c)) {
      return { ...controladoria, motivo: `campanha:${c}` };
    }
    if (/^azi?bii/.test(c)) {
      return { ...bi, motivo: `campanha:${c}` };
    }
  }

  return { ...bi, motivo: "default" };
}
