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
