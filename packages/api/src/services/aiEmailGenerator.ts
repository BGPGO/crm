import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GenerateEmailParams {
  topic: string;
  tone?: string;
  audience?: string;
  language?: string;
}

interface GenerateEmailResult {
  subject: string;
  htmlContent: string;
}

interface ImproveEmailParams {
  htmlContent: string;
  instruction: string;
}

interface ImproveEmailResult {
  htmlContent: string;
}

export async function generateEmail(params: GenerateEmailParams): Promise<GenerateEmailResult> {
  const { topic, tone, audience, language } = params;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: `Você é um copywriter expert em email marketing da Bertuzzi Patrimonial (BGP), empresa de gestão financeira.

IMPORTANTE — Gere APENAS o conteúdo interno do email (sem <html>, <head>, <body>, sem header/footer).
O email será automaticamente envolvido em um template com:
- Header: degradê #244c5a → #abc7c9 com logo BGP
- Container: 600px, fundo branco, padding 32px
- Footer: infos da empresa + link de descadastro

FORMATO DE RESPOSTA: JSON puro { "subject": "...", "htmlContent": "..." }
Sem markdown, sem blocos de código.

REGRAS DE COPY:
- Assunto: máximo 50 caracteres, gere curiosidade, sem ALL CAPS, sem spam words (grátis, urgente, clique)
- Primeira linha: hook forte que prende a atenção
- Parágrafos curtos (2-3 linhas máximo)
- Use <p>, <strong>, <em>, <a>, <ul>/<li>, <img> — sem <div> complexos
- Para imagens: use <img> com width="100%" e border-radius: 8px
- Para botões CTA: use <a> com style="display:inline-block; background:#244c5a; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:15px;"
- Tom: profissional mas próximo, tuteia o leitor ("você"), sem excesso de emojis (máx 1-2)
- NÃO inclua saudação genérica ("Prezado cliente") — comece direto no assunto
- Termine com CTA claro antes do footer (o footer já vem no template)
- Cores do texto: preto (#333) para corpo, #244c5a para títulos e links
- NÃO use palavras de spam: grátis, promoção imperdível, tempo limitado, clique aqui
- Idioma: pt-BR`,
        },
        {
          role: 'user',
          content: `Crie um email de marketing sobre: ${topic}. Tom: ${tone || 'profissional'}. Audiência: ${audience || 'geral'}. Idioma: ${language || 'pt-BR'}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('No response from OpenAI');
    }

    // Clean potential markdown code blocks
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      subject: parsed.subject,
      htmlContent: parsed.htmlContent,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate email: ${errMsg}`);
  }
}

export async function improveEmail(params: ImproveEmailParams): Promise<ImproveEmailResult> {
  const { htmlContent, instruction } = params;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content: `Você é um copywriter expert em email marketing da Bertuzzi Patrimonial (BGP).

Melhore o HTML fornecido seguindo a instrução do usuário.
IMPORTANTE: retorne APENAS o conteúdo interno (sem <html>, <head>, <body>, sem header/footer — eles são adicionados automaticamente pelo sistema).

Regras:
- Parágrafos curtos, hook forte na primeira linha
- Botões CTA: style="display:inline-block; background:#244c5a; color:#ffffff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:bold;"
- Cores: títulos em #244c5a, corpo em #333, links em #244c5a
- Sem spam words (grátis, urgente, imperdível, clique aqui)
- Tom profissional e próximo, pt-BR
- Responda APENAS com HTML, sem markdown nem blocos de código.`,
        },
        {
          role: 'user',
          content: `Email HTML atual:\n\n${htmlContent}\n\nInstrução de melhoria: ${instruction}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text) {
      throw new Error('No response from OpenAI');
    }

    // Clean potential markdown code blocks
    const cleaned = text.replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

    return {
      htmlContent: cleaned,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to improve email: ${errMsg}`);
  }
}
