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
          content:
            'Você é um especialista em email marketing. Gere emails profissionais em HTML com design limpo e responsivo. Responda APENAS com JSON no formato { "subject": "...", "htmlContent": "..." }. Não inclua markdown ou blocos de código.',
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
          content:
            'Você é um especialista em email marketing. Melhore o email HTML fornecido de acordo com a instrução. Responda APENAS com o HTML melhorado, sem markdown nem blocos de código.',
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
