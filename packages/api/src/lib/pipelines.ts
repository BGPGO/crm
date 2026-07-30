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

export const PIPELINE_CONTROLADORIA = '64fb7516ea4eb400219457de';
export const PIPELINE_BI = 'bi-pipeline-bgp';

/** Os dois funis comerciais somados — equivale ao antigo funil "Vendas". */
export const COMMERCIAL_PIPELINE_IDS = [PIPELINE_CONTROLADORIA, PIPELINE_BI];

/**
 * Quem cuida do topo do funil em cada funil: Gustavo no BI, Vicenza na
 * Controladoria. Nas etapas de topo essa pessoa é a responsável, e a partir de
 * "Reunião agendada" ela continua responsável enquanto quem conduz a reunião
 * entra no `closerId` — os dois nomes aparecem no card.
 */
export const SDR_BY_PIPELINE: Record<string, string> = {
  [PIPELINE_BI]: 'usr-gustavo-sdr-bi',
  [PIPELINE_CONTROLADORIA]: '68482c2582aa2e001bc07fd3', // Vicenza Porto
};

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
export const CLOSER_USER_IDS = [
  '6983561663b1a700264854ef', // Oliver
  '68152373e0aa160014645094', // Pedro Arenhaldt
  'cw1lckqn017mm3ylakwwy',    // Caio Bertuzzi
  'cw1lckqbwvz1am1s53f3x',    // Henrique Kovalesky
  '69a9b51dfdabd0001556cd7e', // João Rosa
  '67fe4a5c18dd5f001be93121', // Joao Lopes
];

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
