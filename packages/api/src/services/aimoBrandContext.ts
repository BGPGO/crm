/**
 * AiMO Brand Context — abastece a IA e wrappers de email com a identidade
 * institucional da AiMO Corp. Edite este arquivo para evoluir voz, paleta,
 * proposta de valor e calls-to-action sem mexer em prompts/wrappers.
 */

export const AIMO_BRAND_CONTEXT = `═══ SOBRE A AIMO CORP ═══

QUEM SOMOS
AiMO Corp — gestão patrimonial inteligente. Plataforma fintech consultiva
que une dados, algoritmos e estratégia sob um único objetivo: proteger e
multiplicar patrimônio com a precisão de quem entende que a maior parte
do que se conquista não está no que rende, está no que não se perde.

PROPOSTA DE VALOR
- Wealth management orientado a dados — risco calibrado em tempo real,
  diversificação inteligente, alocação dinâmica.
- Tecnologia que protege — leitura algorítmica de exposição, alertas
  proativos, governança transparente.
- Acompanhamento dedicado — consultoria humana premium para holdings
  familiares, executivos e empresários de alto patrimônio.

PÚBLICO-ALVO
- Holdings familiares e patrimônios consolidados.
- Executivos C-level, empresários, sócios de capital fechado.
- Investidores que já têm patrimônio formado e buscam preservação +
  crescimento estratégico (NÃO somos plataforma para iniciantes).

TOM DE VOZ
- Técnico mas humano, sofisticado mas direto, premium sem pompa.
- Escrita afiada — frases curtas, ideias densas. Toda palavra paga aluguel.
- Confiança baseada em dados (use números, intervalos, comparações).
- ZERO jargão genérico de banco/corretora ("aproveite oportunidades",
  "potencialize seus ganhos", "imperdível"). Soa fake. Não usar.
- ZERO superlativos vazios. Em vez de "incrível", mostre o quê.

PALAVRAS-CHAVE / VOCABULÁRIO
Use: precisão, calibrar, exposição, blindagem, governança, alocação,
algorítmico, descorrelacionado, drawdown controlado, mandato, holding,
sucessão, eficiência tributária, due diligence, hedge, posicionamento,
real return, preservação patrimonial.

Evite: oportunidade única, lucro garantido, retorno de XX%, impossível
perder, super retorno, tudo que cheire a marketing financeiro raso.

═══ NÍVEL DE EXIGÊNCIA VISUAL ═══

Email AIMO NÃO é texto chapado em parágrafos. É um objeto editorial premium.
Toda peça precisa de RITMO visual: blocos com pesos diferentes, contraste
entre dark e claro, hierarquia tipográfica forte, espaçamento generoso.

REGRA DE OURO: pelo menos 2 dos 4 elementos abaixo em todo email:
- Hero dark no topo (bg #0A0E1F + headline grande branca + separador cobalto)
- Bloco numerado (01 / 02 / 03 estilo "pilares" ou "etapas")
- Quote/destaque (caixa com border-left cobalto)
- Stat/insight card (número grande + contexto curto)

Headline principal sempre 32-44px, peso 600, letter-spacing -0.02em.
Subhead sempre presente abaixo do headline (15-17px, color #4A5170 ou #B5BBD1).
NUNCA mais que 3 parágrafos consecutivos sem um elemento visual quebrando.

═══ ESTÉTICA VISUAL ═══

PALETA OFICIAL (use SOMENTE estas em emails AIMO)
- Cobalto primário:    #1E3FFF (CTAs, links, accents)
- Cobalto profundo:    #1735D6 (hover)
- Dark base:           #0A0E1F (textos principais, hero)
- Dark sutil:          #1A2040 (badges, separadores)
- Cinza-azulado:       #4A5170 (textos secundários)
- Neutro claro:        #6B7390 (textos auxiliares, eyebrow)
- Branco gelo:         #F4F5F8 (background)
- Cinza linha:         #E6E8EF (divisores)
- Azul claro overlay:  #EEF1FF (quote/destaque com border-left cobalto)

TIPOGRAFIA
- Display: 'Space Grotesk', 'Inter', system-ui, sans-serif
- Body: 'Inter', 'Space Grotesk', system-ui, sans-serif

COMPONENTES VISUAIS PADRÃO

HERO DARK BLOCK (use quando o email tem 1 mensagem central forte):
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0E1F;border-radius:12px;margin:0 0 32px 0;">
<tr><td style="padding:48px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background-color:#1A2040;padding:6px 12px;border-radius:100px;">
<span style="font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;color:#6B89FF;letter-spacing:1.2px;text-transform:uppercase;">AiMO CORP</span>
</td></tr></table>
<h1 style="margin:24px 0 16px 0;font-family:'Space Grotesk',sans-serif;font-size:38px;line-height:1.1;font-weight:600;color:#FFFFFF;letter-spacing:-0.02em;">Headline impactante.</h1>
<div style="width:48px;height:2px;background-color:#1E3FFF;margin:0 0 24px 0;font-size:0;line-height:0;">&nbsp;</div>
<p style="margin:0;font-family:'Inter',sans-serif;font-size:16px;line-height:1.55;color:#B5BBD1;font-weight:400;">Subhead com o argumento central — uma frase forte e enxuta.</p>
</td></tr>
</table>

BLOCO NUMERADO (use pra "3 pilares", "etapas do processo", "razões"):
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
<tr>
<td valign="top" width="33%" style="padding-right:12px;vertical-align:top;">
<div style="width:36px;height:36px;background-color:#EEF1FF;border-radius:8px;text-align:center;line-height:36px;margin-bottom:12px;">
<span style="font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:600;color:#1E3FFF;">01</span>
</div>
<p style="margin:0 0 6px 0;font-family:'Space Grotesk',sans-serif;font-size:15px;line-height:1.3;font-weight:600;color:#0A0E1F;">Título do pilar</p>
<p style="margin:0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.55;color:#4A5170;">Descrição curta, 2 linhas.</p>
</td>
<td valign="top" width="33%" style="padding:0 6px;vertical-align:top;">[col 2 mesmo padrão]</td>
<td valign="top" width="33%" style="padding-left:12px;vertical-align:top;">[col 3 mesmo padrão]</td>
</tr>
</table>

STAT / INSIGHT CARD (use quando tem um número de impacto):
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0E1F;border-radius:12px;margin:24px 0;">
<tr><td style="padding:32px 40px;">
<p style="margin:0 0 8px 0;font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;color:#6B89FF;letter-spacing:1.4px;text-transform:uppercase;">Insight</p>
<p style="margin:0 0 8px 0;font-family:'Space Grotesk',sans-serif;font-size:42px;line-height:1;font-weight:600;color:#FFFFFF;letter-spacing:-0.03em;">8.7%</p>
<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.5;color:#B5BBD1;">Contexto do número em 1-2 linhas.</p>
</td></tr>
</table>

DIVIDER COBALTO (linha fina pra separar seções):
<div style="width:48px;height:2px;background-color:#1E3FFF;margin:32px 0;font-size:0;line-height:0;">&nbsp;</div>

Eyebrow (label de seção, antes de uma headline):
<p style="margin:0 0 8px 0;font-family:'Space Grotesk',sans-serif;font-size:11px;font-weight:600;color:#1E3FFF;letter-spacing:1.4px;text-transform:uppercase;">RÓTULO DA SEÇÃO</p>

Headline:
<h2 style="margin:0 0 24px 0;font-family:'Space Grotesk',sans-serif;font-size:24px;line-height:1.2;font-weight:600;color:#0A0E1F;letter-spacing:-0.01em;">Headline aqui.</h2>

Parágrafo:
<p style="margin:0 0 20px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.65;color:#0A0E1F;">Texto.</p>

Linha cobalto fina (separador hero):
<div style="width:48px;height:2px;background-color:#1E3FFF;margin:24px 0;"></div>

Quote/destaque:
<div style="background-color:#EEF1FF;border-left:2px solid #1E3FFF;padding:24px 28px;margin:28px 0;">
<p style="margin:0;font-family:'Space Grotesk',sans-serif;font-size:16px;line-height:1.5;font-weight:500;color:#0A0E1F;letter-spacing:-0.005em;">"Frase de impacto."</p>
</div>

Lista de pontos (use números 01/02/03 quando for sequência ou pilares):
<ul style="margin:0 0 24px 0;padding-left:20px;">
<li style="margin-bottom:10px;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#4A5170;">Item.</li>
</ul>

Botão CTA primário (cobalto sólido):
<div style="text-align:center;margin:36px 0;">
<a href="{{CTA_URL}}" data-cta="true" style="display:inline-block;background-color:#1E3FFF;color:#FFFFFF;padding:16px 32px;border-radius:8px;text-decoration:none;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;letter-spacing:0.02em;">Texto do botão →</a>
</div>

Assinatura:
<div style="margin-top:36px;padding-top:24px;border-top:1px solid #E6E8EF;">
<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;color:#4A5170;line-height:1.6;">Equipe <strong style="color:#1E3FFF;font-family:'Space Grotesk',sans-serif;">AiMO Corp</strong></p>
</div>

═══ CALLS-TO-ACTION PADRÃO ═══

Diagnóstico:
- Texto: "Agendar diagnóstico patrimonial →"
- URL placeholder: https://calendly.com/aimocorp/diagnostico

Conteúdo:
- Texto: "Receber análise completa →"
- URL placeholder: https://aimocorp.com.br/insights

═══ ESTRUTURA IDEAL DE EMAIL AIMO ═══
1. (opcional mas recomendado) HERO DARK no topo: badge "AiMO CORP" + headline 36-44px + linha cobalto + subhead 15-17px
2. Saudação enxuta: "*|PRIMEIRO_NOME|*," (uma vírgula, sem "olá")
3. Hook em 1 frase (máximo 15 palavras) com <strong>
4. Contexto (1-2 parágrafos curtos) — mostre que entende a dor/momento
5. ELEMENTO VISUAL FORTE — escolha 1: bloco numerado (3 pilares) OU stat card OU quote/destaque
6. Próximo passo claro — 1 CTA primário centralizado (botão cobalto sólido)
7. Fechamento (1 linha) + assinatura "Equipe AiMO Corp"

═══ EXEMPLO DE EMAIL AIMO BEM FEITO (estilo de referência) ═══
Tópico: "convidar holdings familiares pra diagnóstico patrimonial"
Resposta esperada:

[HERO DARK BLOCK com badge AIMO CORP + headline "O que protege seu patrimônio não é o que ele rende." + linha cobalto + subhead "Diagnóstico de exposição em 30 minutos. Sem compromisso, sem custo."]

<p style="margin:0 0 20px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.65;color:#0A0E1F;">*|PRIMEIRO_NOME|*,</p>

<p style="margin:0 0 20px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.65;color:#0A0E1F;"><strong style="color:#0A0E1F;">A maior parte do patrimônio se perde no que ninguém olha.</strong></p>

<p style="margin:0 0 28px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.65;color:#4A5170;">Concentração não-mapeada, sucessão sem governança, eficiência tributária parada em 2018. Pequenas exposições que custam anos de retorno.</p>

[BLOCO NUMERADO: 01 Mapa de exposição / 02 Governança & sucessão / 03 Eficiência tributária]

[DIVIDER COBALTO]

<p style="margin:0 0 28px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.65;color:#0A0E1F;">Em 30 minutos a gente identifica os 3 pontos que mais valem a pena revisar no seu mandato hoje.</p>

[CTA cobalto: "Agendar diagnóstico patrimonial →"]

[ASSINATURA "Equipe AiMO Corp"]

PADRÃO: ~6-8 elementos distintos. Variação tipográfica. Pesos diferentes. Não 5 parágrafos seguidos.

═══ ANTI-PATTERNS (NÃO FAZER) ═══
- Não use "olá", "querido", "prezado".
- Não termine com "abraços" — use "Equipe AiMO Corp".
- Não use emojis no corpo nem no assunto (exceto setas → ←).
- Não escreva "clique aqui" — o link deve ter contexto.
- Não invente número de retorno/performance — só usar dados reais
  fornecidos pelo usuário no briefing.
- Não use stock financeiro genérico ("hora de investir", "mercado pede
  cautela", "diversifique sua carteira").
- Não inclua <header>/<footer>/<logo> no snippet — o wrap AIMO já adiciona.`;

/**
 * Versão resumida do contexto — para uso em prompts de improveEmail
 * onde o token budget é menor.
 */
export const AIMO_BRAND_CONTEXT_SHORT = `AiMO Corp: gestão patrimonial inteligente, fintech consultiva premium. Tom técnico-humano, sofisticado, dados-driven. Paleta: cobalto #1E3FFF, dark #0A0E1F, neutros. Tipografia: Space Grotesk display, Inter body. Público: holdings familiares, executivos, empresários alto patrimônio. Assinatura: "Equipe AiMO Corp". Evitar jargão de banco genérico, emojis, superlativos vazios.`;
