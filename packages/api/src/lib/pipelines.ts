/**
 * Funis comerciais da BGP e suas etapas.
 *
 * Em 30/07/2026 o funil único "Vendas" foi separado em dois: o funil original
 * virou "Controladoria" (mantendo o ID) e os deals de BI foram movidos para um
 * funil novo, "BI". As etapas do funil de BI são espelhos das de Controladoria
 * — mesmo nome e mesma ordem — por isso cada etapa aqui é uma lista com o ID
 * dos dois funis.
 *
 * Relatórios que existiam antes da separação devem usar COMMERCIAL_PIPELINE_IDS
 * para continuar somando os dois funis; ler só um deles faria o número cair pela
 * metade sem que nada tivesse acontecido no comercial.
 */

import prisma from './prisma';

export const PIPELINE_CONTROLADORIA = '64fb7516ea4eb400219457de';
export const PIPELINE_BI = 'bi-pipeline-bgp';

/**
 * Funil de indicação — lead que chega por quem já é cliente (LP "BGP Indica").
 * NÃO é funil comercial de tráfego: fica fora de `COMMERCIAL_PIPELINE_IDS` de
 * propósito, para não misturar indicação com lead pago nos relatórios.
 */
export const PIPELINE_INDICACAO = '68a773827264cb001fd8316f';

/**
 * Etapa de entrada do funil de indicação. As etapas dele NÃO espelham as do
 * comercial (não tem "LEAD" nem "Marcar reunião"), por isso ficam fora de
 * `STAGE_IDS` — cujos pares são [Controladoria, BI] e são indexados por posição.
 */
export const STAGE_INDICACAO_SEM_CONTATO = '68a773827264cb001fd83171';

/** Os dois funis comerciais somados — equivale ao antigo funil "Vendas". */
export const COMMERCIAL_PIPELINE_IDS = [PIPELINE_CONTROLADORIA, PIPELINE_BI];

/**
 * Funis de atendimento HUMANO: nada automático dispara para um deal que está
 * neles — sem BIA (SDR IA no WhatsApp), sem cadência WABA, sem email por etapa.
 * Decisão do Oliver em 06/08/2026 ao criar o funil de indicação: quem vem por
 * indicação merece contato próximo, não robô.
 *
 * Quem respeita esta lista:
 *   - `leadQualificationEngine.onLeadCreated`/`activateSdrIa` (BIA)
 *   - `automationEngine.evaluateTriggers` (cadências e emails por etapa)
 *   - `routes/webhooks.ts` (não chama os listeners de automação na entrada)
 *
 * Um funil só entra aqui se o time NÃO quiser automação nenhuma nele — o gate
 * é por funil, não por etapa.
 */
export const NO_AUTOMATION_PIPELINE_IDS = [PIPELINE_INDICACAO];

export function isNoAutomationPipeline(pipelineId: string | null | undefined): boolean {
  return !!pipelineId && NO_AUTOMATION_PIPELINE_IDS.includes(pipelineId);
}

/**
 * Quem cuida do topo do funil em cada funil: Gustavo no BI, Vicenza na
 * Controladoria. Nas etapas de topo essa pessoa é a responsável, e a partir de
 * "Reunião agendada" ela continua responsável enquanto quem conduz a reunião
 * entra no `closerId` — os dois nomes aparecem no card.
 */
export const SDR_BY_PIPELINE: Record<string, string> = {
  [PIPELINE_BI]: 'usr-gustavo-sdr-bi',
  [PIPELINE_CONTROLADORIA]: '68482c2582aa2e001bc07fd3', // Vicenza Porto
  // Indicação não tem SDR: quem atende é a Fernanda, do começo ao fim. Ela entra
  // aqui porque é este mapa que o webhook usa para escolher o responsável do
  // lead que chega — `resolveSdrOwner` não a alcança (as etapas de indicação não
  // estão em SDR_STAGE_IDS), então nenhuma troca de etapa reatribui o deal.
  [PIPELINE_INDICACAO]: '663a71aaf689ef001afe68c6', // Fernanda Brunisaki
};

/**
 * Decide o funil de um lead que está ENTRANDO, pelo link da landing page e, se
 * ele não disser nada, pelo nome da campanha. Lead ainda não tem produto
 * vendido, então esses são os únicos sinais disponíveis.
 *
 * A LP vem primeiro porque é onde a pessoa preencheu o formulário — a URL diz o
 * produto. O nome da campanha é mais fraco: "Fluxo BI" e "Fluxo Controladoria"
 * são fluxos de automação do RD, não anúncios, e às vezes chega como template
 * não resolvido ("{{campaign.name}}").
 *
 * A regra é por TOKEN do path, não por slug cadastrado: qualquer LP nova com o
 * produto no nome (`go-bi-bia`, `lp-bi-2027`…) entra sozinha, sem ninguém ter de
 * classificar LP por LP. Só `controladoria`/`valuation` são casados por trecho,
 * porque aparecem colados noutra palavra (`nova-gocontroladoria`).
 *
 * Sem nenhum sinal, vai para BI — decisão do Oliver em 30/07 para o resíduo
 * ambíguo. Para inverter, troque só o retorno final.
 *
 * ⚠️ Espelhado em `supabase/functions/_shared/leadPipeline.ts` para o edge
 * function do GreatPages (Deno não importa deste pacote). Mudou aqui, mude lá.
 */
const BI_PATH_TOKENS = ['bi', 'gobi', 'bi2b'];
const CTRL_PATH_TRECHOS = ['controladoria', 'valuation'];

/**
 * LPs de INDICAÇÃO (`campanha-bgp-indica`, `bgp-indica`…) — o lead vem de quem
 * já é cliente, não de anúncio. Vai para o funil de indicação, que é humano:
 * sem BIA e sem cadência (ver NO_AUTOMATION_PIPELINE_IDS).
 *
 * Testado ANTES do BI/Controladoria: o slug traz a marca ("bgp-indica") e, se um
 * dia trouxer o produto junto ("indica-bi"), o sinal de indicação é o mais
 * específico dos dois e tem de vencer.
 */
const INDICACAO_PATH_TOKENS = ['indica', 'indicacao', 'indique'];

/**
 * LPs de INSCRIÇÃO NA NEWSLETTER — o lead não é lead de venda: vira contato +
 * assinante (NewsletterSubscriber), sem deal e sem notificar SDR. O deal só
 * nasce lá na frente, quando a jornada qualifica (ver newsletterJourney.ts).
 * `newslatter` está aqui de propósito: é o slug real publicado (com typo).
 */
const NEWSLETTER_PATH_TOKENS = ['news', 'newsletter', 'newslatter'];

export function isNewsletterLead(params: {
  landingPage?: string | null;
}): boolean {
  const { landingPage } = params;
  if (!landingPage) return false;
  const path = landingPage
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[?#]/)[0]
    .replace(/^[^/]*\//, '');
  const tokens = path.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((t) => NEWSLETTER_PATH_TOKENS.includes(t));
}

export function resolveLeadPipeline(params: {
  landingPage?: string | null;
  campaign?: string | null;
}): { pipelineId: string; stageId: string; ownerId: string; motivo: string } {
  const { landingPage, campaign } = params;

  const bi = {
    pipelineId: PIPELINE_BI,
    stageId: STAGE_IDS.LEAD[1],
    ownerId: SDR_BY_PIPELINE[PIPELINE_BI],
  };
  const controladoria = {
    pipelineId: PIPELINE_CONTROLADORIA,
    stageId: STAGE_IDS.LEAD[0],
    ownerId: SDR_BY_PIPELINE[PIPELINE_CONTROLADORIA],
  };
  const indicacao = {
    pipelineId: PIPELINE_INDICACAO,
    stageId: STAGE_INDICACAO_SEM_CONTATO,
    ownerId: SDR_BY_PIPELINE[PIPELINE_INDICACAO],
  };

  // 1) Landing page. Aceita URL completa ou só o slug: tiramos protocolo, host
  // e query, e sobra o caminho — é dele que os tokens saem.
  if (landingPage) {
    const path = landingPage
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .split(/[?#]/)[0]
      .replace(/^[^/]*\//, ''); // remove o host quando ele existe

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
    // Indicação primeiro, pela mesma razão da LP: é o sinal mais específico.
    if (/indica|indique/.test(c)) {
      return { ...indicacao, motivo: `campanha:${c}` };
    }
    if (/(^|[^a-z])bi([^a-z]|$)/.test(c) || c.startsWith('fluxo bi') || c.includes('aimo-bi')) {
      return { ...bi, motivo: `campanha:${c}` };
    }
    if (/(^|[^a-z])(fin|controladoria)([^a-z]|$)/.test(c) || c.startsWith('fluxo valuation')) {
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

  return { ...bi, motivo: 'default' };
}

/**
 * Responsável que o webhook usava para TODO lead que entrava (o Oliver).
 * Serve para distinguir "dono por omissão" de "dono escolhido por alguém": a
 * regra do SDR só sobrescreve o primeiro, para não desfazer atribuição manual.
 */
export const LEGACY_DEFAULT_OWNER_ID = '6983561663b1a700264854ef';

/**
 * Quem pode ser closer, ou seja, quem conduz reunião. Definição do Oliver em
 * 30/07: a Vicenza e o Gustavo NÃO são closers — eles são SDR.
 *
 * Serve de guarda para o que vem de fora: o `hostEmail` do Calendly é o dono do
 * link de agendamento, não necessariamente quem atende, e sem essa lista a
 * Vicenza acabou gravada como closer de deals em que ela só cedeu o link.
 */
/**
 * Ordem de prioridade quando mais de um closer esteve na mesma reunião.
 *
 * Reproduz exatamente as regras que o Oliver deu em 30/07 — "tem Oliver, é
 * Oliver"; "Caio + Henrique ou Caio + João, é Caio"; "Henrique + João, é
 * Henrique"; "dupla com o Pedro, é Pedro" — só que como uma ordem única em vez
 * de uma lista de casos, o que evita combinação nova cair sem regra.
 */
export const CLOSER_PRIORITY = [
  '6983561663b1a700264854ef', // Oliver
  'cw1lckqn017mm3ylakwwy',    // Caio Bertuzzi
  'cw1lckqbwvz1am1s53f3x',    // Henrique Kovalesky
  '68152373e0aa160014645094', // Pedro Arenhaldt
  '69a9b51dfdabd0001556cd7e', // João Rosa
  '67fe4a5c18dd5f001be93121', // Joao Lopes
];

export const CLOSER_USER_IDS = CLOSER_PRIORITY;

/** Dos closers presentes numa reunião, qual conta como o closer do deal. */
export function pickCloser(userIds: string[]): string | null {
  const presentes = userIds.filter(isCloser);
  if (presentes.length === 0) return null;
  if (presentes.length === 1) return presentes[0];
  return CLOSER_PRIORITY.find((id) => presentes.includes(id)) ?? presentes[0];
}

export function isCloser(userId: string | null | undefined): boolean {
  return !!userId && CLOSER_USER_IDS.includes(userId);
}

/** IDs de cada etapa nos dois funis, na ordem [Controladoria, BI]. */
export const STAGE_IDS = {
  LEAD: ['64fb7516ea4eb400219457df', 'bi-stage-1'],
  CONTATO_FEITO: ['65bd0418294535000d1f57cd', 'bi-stage-2'],
  MARCAR_REUNIAO: ['64fb7516ea4eb400219457e0', 'bi-stage-3'],
  REUNIAO_AGENDADA: ['64fb7517ea4eb400219457e1', 'bi-stage-4'],
  PROPOSTA_ENVIADA: ['64fb7517ea4eb400219457e2', 'bi-stage-5'],
  AGUARDANDO_DADOS: ['661d5a409a6525001ed04124', 'bi-stage-6'],
  AGUARDANDO_ASSINATURA: ['64fb7517ea4eb400219457e3', 'bi-stage-7'],
  GANHO_FECHADO: ['65084ece058c5700170506d4', 'bi-stage-8'],
  PERDA_FECHADA: ['65084ed69b4e68571c053200', 'bi-stage-9'],
};

/**
 * ID da etapa dentro de um funil específico. As listas de `STAGE_IDS` estão na
 * ordem [Controladoria, BI]; usar índice na mão é como um deal acaba com stageId
 * de outro funil (e fora do board dos dois).
 */
export function stageIdFor(pipelineId: string, etapa: keyof typeof STAGE_IDS): string {
  const [ctrl, bi] = STAGE_IDS[etapa];
  return pipelineId === PIPELINE_BI ? bi : ctrl;
}

/**
 * Etapa pelo nome DENTRO de um funil. É o único jeito seguro de uma automação
 * mover deal de coluna: os nomes das etapas se repetem entre os funis, então
 * buscar só pelo nome devolve a etapa de outro funil e o deal some do kanban
 * (o board monta as colunas com as etapas do funil do deal). Devolve null se o
 * funil não tem etapa com esse nome — nesse caso NÃO mova o deal.
 */
export function findStageByName(pipelineId: string, nome: string) {
  return prisma.pipelineStage.findFirst({
    where: { pipelineId, name: { contains: nome, mode: 'insensitive' } },
  });
}

/** Nomes das etapas — iguais nos dois funis. */
export const STAGE_NAMES = {
  LEAD: 'LEAD',
  CONTATO_FEITO: 'Contato feito',
  MARCAR_REUNIAO: 'Marcar reunião',
  REUNIAO_AGENDADA: 'Reunião agendada',
  PROPOSTA_ENVIADA: 'Proposta enviada',
  AGUARDANDO_DADOS: 'Aguardando dados',
  AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  GANHO_FECHADO: 'Ganho fechado',
  PERDA_FECHADA: 'Perda fechada',
};

/**
 * Etapas de topo — Contato feito, Marcar reunião e Reunião agendada — nos dois
 * funis. É o trecho em que o lead é do SDR.
 */
export const SDR_STAGE_IDS = [
  ...STAGE_IDS.CONTATO_FEITO,
  ...STAGE_IDS.MARCAR_REUNIAO,
  ...STAGE_IDS.REUNIAO_AGENDADA,
];

/**
 * Devolve o novo responsável quando um deal entra no topo do funil, ou null
 * quando não há nada a mudar.
 *
 * Só sobrescreve quem está sem dono ou com o dono por omissão do webhook. Se
 * alguém atribuiu o deal a uma pessoa específica, essa escolha vence — do
 * contrário toda passada por essa etapa desfaria a atribuição manual.
 */
export function resolveSdrOwner(params: {
  pipelineId: string;
  stageId: string;
  currentUserId: string | null;
}): string | null {
  const { pipelineId, stageId, currentUserId } = params;
  const sdr = SDR_BY_PIPELINE[pipelineId];
  if (!sdr) return null;
  if (!SDR_STAGE_IDS.includes(stageId)) return null;
  if (currentUserId === sdr) return null;
  if (currentUserId && currentUserId !== LEGACY_DEFAULT_OWNER_ID) return null;
  return sdr;
}
