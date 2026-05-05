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

Eyebrow (label de seção):
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
1. Saudação enxuta: "*|PRIMEIRO_NOME|*," (uma vírgula, sem "olá")
2. Hook em 1 frase (máximo 15 palavras) com <strong>
3. Contexto (1-2 parágrafos curtos) — mostre que entende a dor/momento
4. Insight ou dado (parágrafo OU quote/destaque OU lista numerada)
5. Próximo passo claro — 1 CTA primário centralizado
6. Fechamento (1 linha) + assinatura "Equipe AiMO Corp"

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
