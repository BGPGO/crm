import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:
        'Você é um especialista em email marketing. Gere emails profissionais em HTML com design limpo e responsivo. Responda APENAS com JSON no formato { subject, htmlContent }.',
      messages: [
        {
          role: 'user',
          content: `Crie um email de marketing sobre: ${topic}. Tom: ${tone || 'profissional'}. Audiência: ${audience || 'geral'}. Idioma: ${language || 'pt-BR'}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const parsed = JSON.parse(textBlock.text);

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
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:
        'Você é um especialista em email marketing. Melhore o email HTML fornecido de acordo com a instrução. Responda APENAS com o HTML melhorado.',
      messages: [
        {
          role: 'user',
          content: `Email HTML atual:\n\n${htmlContent}\n\nInstrução de melhoria: ${instruction}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    return {
      htmlContent: textBlock.text,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to improve email: ${errMsg}`);
  }
}
