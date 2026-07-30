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
 * SDR do topo do funil de BI. Todo lead de BI em "Contato feito" e
 * "Marcar reunião" fica com ele; a partir de "Reunião agendada" ele continua
 * como responsável e quem conduz a reunião entra no `closerId`.
 */
export const SDR_BI_USER_ID = 'usr-gustavo-sdr-bi';

/**
 * Responsável que o webhook usava para TODO lead que entrava (o Oliver).
 * Serve para distinguir "dono por omissão" de "dono escolhido por alguém": a
 * regra do SDR só sobrescreve o primeiro, para não desfazer atribuição manual.
 */
export const LEGACY_DEFAULT_OWNER_ID = '6983561663b1a700264854ef';

/**
 * Etapas do funil de BI em que o responsável é o SDR: Contato feito, Marcar
 * reunião e Reunião agendada. Nesta última ele continua como responsável e quem
 * conduz a reunião entra em `closerId` — os dois nomes aparecem no card.
 */
export const BI_SDR_STAGE_IDS = ['bi-stage-2', 'bi-stage-3', 'bi-stage-4'];

/**
 * Devolve o novo responsável quando um deal entra no topo do funil de BI, ou
 * null quando não há nada a mudar.
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
  if (pipelineId !== PIPELINE_BI) return null;
  if (!BI_SDR_STAGE_IDS.includes(stageId)) return null;
  if (currentUserId === SDR_BI_USER_ID) return null;
  if (currentUserId && currentUserId !== LEGACY_DEFAULT_OWNER_ID) return null;
  return SDR_BI_USER_ID;
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
