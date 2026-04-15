/**
 * HTML templates for email automation by funnel stage.
 *
 * Each html*() function returns ONLY the body HTML (the inner content), not
 * the full document. Consumers (seed/update) build the persisted fields like
 * the editor does:
 *   - htmlContent = compileFullHtml(body)   // DOCTYPE + layout tables + body
 *   - jsonContent = buildJsonContent(body)  // { design, bodyHtml }
 *
 * This matches exactly what web/src/app/marketing/emails/templates/[id]/page.tsx
 * persists when the user saves a template in the editor. Having jsonContent
 * populated means the editor loads just the body (no outer layout tables in
 * the contentEditable area), which was the root cause of the visual "gray
 * strip inside the preview" issue.
 *
 * At send time, automationActions applies stripOuterWrapper() + wrapInBrandTemplate()
 * on htmlContent to get the final branded email (same flow as sendCampaignEmails).
 *
 * Placeholders like *|PRIMEIRO_NOME|* are left intact for the engine to replace.
 */

import { CTA_BUTTON_STYLE } from '../services/emailTemplate';

const CALENDLY_URL =
  'https://calendly.com/d/cybr-crz-ttw/diagnostico-financeiro-bgp';

const WHATSAPP_URL =
  'https://wa.me/5551992091726?text=Ol%C3%A1%2C%20quero%20falar%20sobre%20o%20meu%20financeiro!';

// Hospedagem das imagens no Supabase Storage (bucket público `email-assets`).
// Não depende de deploy da API — funciona no preview do editor imediatamente.
// Uploads feitos por src/seeds/uploadEmailAssets.ts.
const ASSETS_BASE = 'https://gqjgbwzxlqkwvrtorhvb.supabase.co/storage/v1/object/public/email-assets';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function heading(text: string): string {
  return `<p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#1a1a1a;font-family:Montserrat,'Trebuchet MS',Tahoma,sans-serif;">${text}</p>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 16px;line-height:1.6;font-size:15px;color:#333;font-family:Montserrat,'Trebuchet MS',Tahoma,sans-serif;">${text}</p>`;
}

function ctaButton(label: string, href: string): string {
  // data-cta="true" é o que o editor (templates/[id]/page.tsx:71) usa pra
  // detectar o link como botão e listar em "Botões detectados" — sem esse
  // atributo o editor não reconhece o CTA e o usuário não consegue editar o
  // destino pela UI.
  return `<p style="margin:20px 0;text-align:center;"><a href="${href}" data-cta="true" target="_blank" rel="noopener" style="${CTA_BUTTON_STYLE}">${label}</a></p>`;
}

function imgResponsive(src: string, alt: string): string {
  return `<img src="${src}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;display:block;" />`;
}

/**
 * Default design — mirrors web/src/components/marketing/EmailDesignPanel.tsx:DEFAULT_DESIGN
 * plus the Montserrat font used by the BGP brand.
 */
export const DEFAULT_TEMPLATE_DESIGN = {
  bodyBg: '#f4f4f5',
  contentBg: '#ffffff',
  contentWidth: 600,
  fontFamily: "Montserrat,'Trebuchet MS','Lucida Grande','Lucida Sans Unicode','Lucida Sans',Tahoma,sans-serif",
  fontSize: 15,
  textColor: '#333333',
  linkColor: '#3ae056',
  paddingX: 32,
  paddingY: 32,
};

/**
 * Matches the web editor's compileFullHtml() exactly (templates/[id]/page.tsx:313).
 * Produces DOCTYPE + basic HTML + outer layout tables with a neutral white card.
 * NO BGP brand shell (no logo, no footer) — that is applied at send time.
 */
export function compileFullHtml(bodyHtml: string, design = DEFAULT_TEMPLATE_DESIGN): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${design.bodyBg};font-family:${design.fontFamily};font-size:${design.fontSize}px;color:${design.textColor};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${design.bodyBg};">
<tr><td align="center" style="padding:${design.paddingY}px 0;">
<table role="presentation" width="${design.contentWidth}" cellpadding="0" cellspacing="0" style="background-color:${design.contentBg};border-radius:8px;">
<tr><td style="padding:${design.paddingY}px ${design.paddingX}px;">
${bodyHtml}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

/**
 * Builds the jsonContent blob that the editor stores alongside htmlContent.
 * When the template is opened in the editor (templates/[id]/page.tsx:160), it
 * reads `parsed.bodyHtml` to render just the body in the contentEditable area,
 * avoiding the outer layout tables being visible inside the editor.
 */
export function buildJsonContent(bodyHtml: string) {
  return JSON.stringify({ design: DEFAULT_TEMPLATE_DESIGN, bodyHtml });
}

// ─── 1. Boas-vindas #1 ───────────────────────────────────────────────────────

export function htmlBoasVindas1(): string {
  const body = `
${heading('Olá *|PRIMEIRO_NOME|*, tudo bem?')}
${p('Estamos felizes em recebê-lo(a) no início de uma jornada transformadora com a BGP GO! Esta ferramenta é um verdadeiro divisor de águas e está pronta para elevar o nível da gestão de dados do seu negócio.')}
${p('Nossa equipe está totalmente disponível para assegurar uma experiência fluida e enriquecedora. Conte conosco para qualquer suporte ou dúvida que surgir!')}
${p('Agradecemos por escolher a BGP para guiar os dados até as decisões estratégicas de sua empresa. Estamos ansiosos para testemunhar o crescimento e os novos patamares que sua empresa alcançará!')}
${p('Para mais informações e para começar sua jornada conosco, visite nosso site: <a href="https://bertuzzipatrimonial.com.br" target="_blank" rel="noopener" style="color:#3ae056;text-decoration:underline;">bertuzzipatrimonial.com.br</a>.')}
${p('Um abraço, equipe BGP')}
${ctaButton('Agendar diagnóstico gratuito', CALENDLY_URL)}
`;
  return body;
}

// ─── 2. Boas-vindas #2 ───────────────────────────────────────────────────────

export function htmlBoasVindas2(): string {
  const body = `
${heading('Oi, *|PRIMEIRO_NOME|*! Tudo certo?')}
${p('Se você chegou até aqui, provavelmente já percebeu uma coisa:')}
${p('<strong>Crescer sem ter controle financeiro é como pilotar no escuro.</strong>')}
${p('E é justamente por isso que criamos soluções como o <strong>GO BI</strong> e a <strong>GO Controladoria</strong>, para transformar números soltos em decisões seguras, com clareza e inteligência financeira.')}
${p('Aqui vai um resumo do que podemos fazer juntos:')}
${p('<strong>Com o GO BI</strong><br>Você tem acesso a dashboards automatizados e prontos direto do seu ERP Financeiro, com fluxo de caixa, DRE, margem por serviço, inadimplência e muito mais.<br>Sem planilhas, sem complicação.')}
${imgResponsive(`${ASSETS_BASE}/gobi-dashboard-1.png`, 'GO BI — Dashboard financeiro')}
${p('<strong>Com a GO Controladoria</strong><br>Uma equipe técnica e estratégica ajuda a estruturar seu financeiro, montar rotina de fechamento mensal, comparar orçado x realizado, e trazer previsibilidade real pro negócio.')}
${imgResponsive(`${ASSETS_BASE}/gobi-dashboard-2.png`, 'GO Controladoria — Visão estratégica')}
${p('A gente não vende sistema.<br><strong>A gente entrega visão</strong>, pra quem quer crescer com base em dados, não em achismo.<br>E tudo isso com suporte humano, acompanhamento real e garantias de entrega.')}
${p('Se você sente que vende, mas não vê lucro, ou trabalha muito e não sente que o dinheiro acompanha…')}
${p('Você não está sozinho. E sim, existe uma forma mais inteligente de tocar o financeiro.')}
${p('Logo mais, alguém do nosso time entra em contato contigo.')}
${p('Enquanto isso, pode responder esse e-mail se quiser nos contar um pouco mais do seu momento.')}
${p('Vamos juntos?')}
${p('Um abraço,')}
${ctaButton('Agendar conversa com especialista', CALENDLY_URL)}
`;
  return body;
}

// ─── 3. Conversa Realizada ───────────────────────────────────────────────────

export function htmlConversaRealizada(): string {
  const body = `
${heading('Olá *|PRIMEIRO_NOME|*,')}
${p('<strong>Foi um prazer conversar com você!</strong> Como comentamos, a <strong>BGP GO</strong> pode transformar a maneira como sua empresa interpreta e utiliza dados para <strong>impulsionar decisões estratégicas</strong>.')}
${p('Estou ansioso para explorar como podemos personalizar nossa solução para atender às necessidades específicas do seu negócio. Vamos agendar um momento para aprofundar essa discussão e demonstrar o verdadeiro potencial da BGP GO.')}
${p('Atenciosamente,')}
${ctaButton('Agendar reunião', CALENDLY_URL)}
`;
  return body;
}

// ─── 4. Reunião Agendada ─────────────────────────────────────────────────────

export function htmlReuniaoAgendada(): string {
  const body = `
${heading('Olá *|PRIMEIRO_NOME|*,')}
${p('Sua <strong>reunião</strong> para descobrir mais sobre a BGP GO está <strong>confirmada</strong>.')}
${p('<strong>Preparei todo o material para nossa reunião</strong> e estou ansioso para <strong>compartilhá-lo com você.</strong> Tenho certeza de que as informações que reunimos serão extremamente valiosas para o alcance dos seus objetivos.')}
${p('Em breve enviaremos para o seu <strong>WhatsApp o link do Google Meet para a nossa conversa</strong>. Estou certo de que as <strong>informações serão esclarecedoras e muito úteis para seus objetivos</strong>.')}
${p('<strong>Nos vemos em breve!</strong>')}
${p('Se houver algo específico que você gostaria de abordar, por favor, chame no botão abaixo.')}
${ctaButton('Falar com a equipe', WHATSAPP_URL)}
`;
  return body;
}

// ─── 5. Envio Feito (Proposta Enviada) ───────────────────────────────────────

export function htmlEnvioFeito(): string {
  const body = `
${heading('Olá *|PRIMEIRO_NOME|*,')}
${p('Conforme falamos em nossa última reunião, encaminhei para você <strong>nossa proposta personalizada</strong>. Nela você encontrará todos os detalhes, incluindo escopo, cronograma e investimento.')}
${p('Acreditamos que essa solução não só atenderá, mas <strong>superará suas expectativas, proporcionando insights valiosos que impulsionarão seu crescimento e eficiência</strong>.')}
${p('<strong>Por que é importante agir agora?</strong>')}
${p('Nossos projetos são desenhados com cronogramas específicos para garantir que cada etapa seja meticulosamente planejada e executada.')}
${p('A <strong>alocação de tempo no projeto é crucial</strong> e desejamos sincronizar nossos esforços com os seus disponíveis, assegurando que nosso trabalho juntos seja o mais produtivo possível.')}
${p('<strong>Comprometidos com seus resultados:</strong>')}
${p('Estamos confiantes de que esta solução irá fornecer insights e análises que impulsionarão significativamente seu crescimento e eficiência operacional.')}
${p('Por favor, reveja a proposta e não hesite em entrar em contato se tiver alguma dúvida.')}
${p('<strong>Agradecemos por considerar a BGP como sua parceira de confiança</strong>. Estamos ansiosos para avançar e ver as transformações positivas que podemos realizar juntos.')}
${p('Atenciosamente,')}
${ctaButton('Fechar agora', WHATSAPP_URL)}
`;
  return body;
}

// ─── 6. Aguardando Dados ─────────────────────────────────────────────────────

export function htmlAguardandoDados(): string {
  const body = `
${heading('Olá *|PRIMEIRO_NOME|*,')}
${p('Estamos ansiosos para prosseguir com a implementação para sua empresa. Para continuar, precisamos que você nos envie as informações descritas abaixo.')}
${p('<strong>Dados necessários:</strong>')}
<ol style="padding-left:20px;margin:0 0 16px;font-size:15px;color:#333;line-height:1.8;font-family:Montserrat,'Trebuchet MS',Tahoma,sans-serif;">
  <li>Cartão CNPJ</li>
  <li>Nome do responsável</li>
  <li>CPF do responsável</li>
  <li>E-mail do responsável</li>
  <li>E-mail do financeiro</li>
  <li>Forma de pagamento</li>
  <li>Melhor dia de vencimento</li>
</ol>
${p('Por favor, envie os dados necessários para que possamos manter o processo em movimento sem atrasos. Se precisar de assistência para compilar esses dados, estamos aqui para ajudar.')}
${p('Atenciosamente,')}
${ctaButton('Falar com a equipe', WHATSAPP_URL)}
`;
  return body;
}

// ─── 7. Aguardando Assinatura ────────────────────────────────────────────────

export function htmlAguardandoAssinatura(): string {
  const body = `
${heading('Olá *|PRIMEIRO_NOME|*,')}
${p('Estamos a apenas um passo de iniciar nossa jornada com a BGP GO em sua empresa. O <strong>contrato foi enviado para sua revisão e estamos aguardando sua assinatura para darmos início ao projeto</strong>.')}
${p('Lembramos que estamos à disposição para esclarecer quaisquer dúvidas sobre os termos do contrato ou qualquer outro aspecto da nossa parceria.')}
${p('Aguardamos sua confirmação para que possamos agendar o início dos trabalhos.')}
${p('Atenciosamente,')}
${ctaButton('Falar com a equipe', WHATSAPP_URL)}
`;
  return body;
}
