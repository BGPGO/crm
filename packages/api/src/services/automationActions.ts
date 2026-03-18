import prisma from '../lib/prisma';
import { Resend } from 'resend';
import { isUnsubscribed } from './unsubscribeManager';
import { ZApiClient } from '../services/zapiClient';
import OpenAI from 'openai';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActionResult {
  success: boolean;
  output?: any;
  conditionResult?: boolean; // for CONDITION type
  nextActionAt?: Date; // returned by WAIT action so the engine uses the fresh value
}

// ─── Action Executor ─────────────────────────────────────────────────────────

/**
 * Executes a single automation step action and returns the result.
 */
export async function executeAction(
  enrollment: any,
  step: any
): Promise<ActionResult> {
  const config = step.config as any;

  try {
    switch (step.actionType) {
      case 'ADD_TAG':
        return await addTag(enrollment.contactId, config);

      case 'REMOVE_TAG':
        return await removeTag(enrollment.contactId, config);

      case 'SEND_EMAIL':
        return await sendEmail(enrollment.contactId, config);

      case 'WAIT':
        return await wait(enrollment, config);

      case 'UPDATE_FIELD':
        return await updateField(enrollment.contactId, config);

      case 'MOVE_PIPELINE_STAGE':
        return await movePipelineStage(enrollment.contactId, config);

      case 'SEND_WHATSAPP':
        return await sendWhatsApp(enrollment.contactId, config);

      case 'CONDITION':
        return await evaluateCondition(enrollment.contactId, config);

      case 'SEND_WHATSAPP_AI':
        return await sendWhatsAppAI(enrollment, config);

      case 'MARK_LOST':
        return await markLost(enrollment.contactId, config);

      default:
        return { success: false, output: `Unknown action type: ${step.actionType}` };
    }
  } catch (error) {
    return {
      success: false,
      output: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Individual Actions ──────────────────────────────────────────────────────

async function addTag(
  contactId: string,
  config: { tagId: string }
): Promise<ActionResult> {
  await prisma.contactTag.upsert({
    where: {
      contactId_tagId: {
        contactId,
        tagId: config.tagId,
      },
    },
    update: {},  // already exists — nothing to change
    create: {
      contactId,
      tagId: config.tagId,
    },
  });
  return { success: true, output: { tagId: config.tagId, action: 'added' } };
}

async function removeTag(
  contactId: string,
  config: { tagId: string }
): Promise<ActionResult> {
  await prisma.contactTag.deleteMany({
    where: {
      contactId,
      tagId: config.tagId,
    },
  });
  return { success: true, output: { tagId: config.tagId, action: 'removed' } };
}

async function sendEmail(
  contactId: string,
  config: { templateId: string }
): Promise<ActionResult> {
  const template = await prisma.emailTemplate.findUniqueOrThrow({
    where: { id: config.templateId },
  });

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });

  if (!contact.email) {
    return { success: false, output: 'Contact has no email address' };
  }

  // Check if the contact has unsubscribed before sending
  if (await isUnsubscribed(contact.email)) {
    return { success: false, output: 'Contact unsubscribed' };
  }

  const result = await resend.emails.send({
    from: `BGPGO <noreply@bgpgo.com>`,
    to: contact.email,
    subject: template.subject || template.name,
    html: template.htmlContent,
  });

  return {
    success: true,
    output: { messageId: result.data?.id, templateId: config.templateId },
  };
}

async function wait(
  enrollment: any,
  config: { duration: number; unit: 'minutes' | 'hours' | 'days' }
): Promise<ActionResult> {
  const now = new Date();
  let nextActionAt: Date;

  switch (config.unit) {
    case 'minutes':
      nextActionAt = new Date(now.getTime() + config.duration * 60 * 1000);
      break;
    case 'hours':
      nextActionAt = new Date(now.getTime() + config.duration * 60 * 60 * 1000);
      break;
    case 'days':
      nextActionAt = new Date(now.getTime() + config.duration * 24 * 60 * 60 * 1000);
      break;
    default:
      nextActionAt = new Date(now.getTime() + config.duration * 60 * 1000);
  }

  await prisma.automationEnrollment.update({
    where: { id: enrollment.id },
    data: { nextActionAt },
  });

  return {
    success: true,
    output: { waitUntil: nextActionAt.toISOString(), duration: config.duration, unit: config.unit },
    nextActionAt,
  };
}

const ALLOWED_UPDATE_FIELDS = new Set([
  'name', 'phone', 'position', 'notes', 'city', 'state',
]);

async function updateField(
  contactId: string,
  config: { field: string; value: string }
): Promise<ActionResult> {
  if (!ALLOWED_UPDATE_FIELDS.has(config.field)) {
    return {
      success: false,
      output: `Field "${config.field}" is not allowed. Allowed fields: ${[...ALLOWED_UPDATE_FIELDS].join(', ')}`,
    };
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: { [config.field]: config.value },
  });

  return {
    success: true,
    output: { field: config.field, value: config.value },
  };
}

async function sendWhatsApp(
  contactId: string,
  config: { messageTemplateId?: string; customMessage?: string }
): Promise<ActionResult> {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });

  if (!contact.phone) {
    return { success: false, output: 'Contact has no phone number' };
  }

  let messageText: string;

  if (config.messageTemplateId) {
    const template = await prisma.whatsAppMessageTemplate.findUnique({
      where: { id: config.messageTemplateId },
    });
    if (!template) {
      return { success: false, output: 'WhatsApp message template not found' };
    }
    // Replace placeholders
    messageText = template.content
      .replace(/\{\{nome\}\}/gi, contact.name || '')
      .replace(/\{\{email\}\}/gi, contact.email || '')
      .replace(/\{\{telefone\}\}/gi, contact.phone || '')
      .replace(/\{\{cidade\}\}/gi, (contact as any).city || '')
      .replace(/\{\{estado\}\}/gi, (contact as any).state || '');
  } else if (config.customMessage) {
    messageText = config.customMessage
      .replace(/\{\{nome\}\}/gi, contact.name || '')
      .replace(/\{\{email\}\}/gi, contact.email || '')
      .replace(/\{\{telefone\}\}/gi, contact.phone || '')
      .replace(/\{\{cidade\}\}/gi, (contact as any).city || '')
      .replace(/\{\{estado\}\}/gi, (contact as any).state || '');
  } else {
    return { success: false, output: 'No message template or custom message provided' };
  }

  // Send via Evolution API
  const { EvolutionApiClient } = await import('./evolutionApiClient');
  const client = await EvolutionApiClient.fromConfig();
  await client.sendText(contact.phone, messageText);

  return {
    success: true,
    output: {
      phone: contact.phone,
      messageLength: messageText.length,
      templateId: config.messageTemplateId || null,
    },
  };
}

async function movePipelineStage(
  contactId: string,
  config: { stageId: string }
): Promise<ActionResult> {
  // Find the contact's active deals and move them to the target stage
  const deals = await prisma.deal.findMany({
    where: {
      contactId,
      status: 'OPEN',
    },
  });

  if (deals.length === 0) {
    return { success: false, output: 'No active deals found for contact' };
  }

  for (const deal of deals) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { stageId: config.stageId },
    });
  }

  return {
    success: true,
    output: {
      stageId: config.stageId,
      dealsUpdated: deals.length,
      dealIds: deals.map((d) => d.id),
    },
  };
}

async function evaluateCondition(
  contactId: string,
  config: { field: string; operator: string; value: string }
): Promise<ActionResult> {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });

  const fieldValue = String((contact as any)[config.field] ?? '');
  const targetValue = config.value;
  let conditionResult = false;

  switch (config.operator) {
    case 'equals':
    case 'eq':
      conditionResult = fieldValue === targetValue;
      break;
    case 'not_equals':
    case 'neq':
      conditionResult = fieldValue !== targetValue;
      break;
    case 'contains':
      conditionResult = fieldValue.includes(targetValue);
      break;
    case 'not_contains':
      conditionResult = !fieldValue.includes(targetValue);
      break;
    case 'starts_with':
      conditionResult = fieldValue.startsWith(targetValue);
      break;
    case 'ends_with':
      conditionResult = fieldValue.endsWith(targetValue);
      break;
    case 'is_empty':
      conditionResult = fieldValue === '' || fieldValue === 'null' || fieldValue === 'undefined';
      break;
    case 'is_not_empty':
      conditionResult = fieldValue !== '' && fieldValue !== 'null' && fieldValue !== 'undefined';
      break;
    case 'gt':
      conditionResult = Number(fieldValue) > Number(targetValue);
      break;
    case 'gte':
      conditionResult = Number(fieldValue) >= Number(targetValue);
      break;
    case 'lt':
      conditionResult = Number(fieldValue) < Number(targetValue);
      break;
    case 'lte':
      conditionResult = Number(fieldValue) <= Number(targetValue);
      break;
    default:
      conditionResult = false;
  }

  return {
    success: true,
    conditionResult,
    output: {
      field: config.field,
      operator: config.operator,
      expected: targetValue,
      actual: fieldValue,
      result: conditionResult,
    },
  };
}

async function sendWhatsAppAI(
  enrollment: any,
  config: { prompt: string; objective: string }
): Promise<ActionResult> {
  // 1. Find the contact's phone
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: enrollment.contactId },
  });

  if (!contact.phone) {
    return { success: false, output: 'Contact has no phone number' };
  }

  // 2. Find or create WhatsAppConversation for this phone
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phone: contact.phone },
  });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        phone: contact.phone,
        contactId: contact.id,
        isActive: true,
        status: 'open',
      },
    });
  }

  // 3. Get OpenAI API key from WhatsApp config
  const waConfig = await prisma.whatsAppConfig.findFirst();
  const openaiKey = waConfig?.openaiApiKey || process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return { success: false, output: 'OpenAI API key not configured' };
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  // 4. Generate AI message using the prompt and objective
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Você é um assistente de vendas da BGPGO. Seu objetivo: ${config.objective}\n\nInstruções: ${config.prompt}\n\nNome do contato: ${contact.name}\nEmail: ${contact.email || 'N/A'}\nTelefone: ${contact.phone}`,
      },
      {
        role: 'user',
        content: 'Gere a mensagem de WhatsApp para este contato. Responda APENAS com o texto da mensagem, sem aspas ou formatação extra.',
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const messageText = completion.choices[0]?.message?.content?.trim();
  if (!messageText) {
    return { success: false, output: 'AI failed to generate message' };
  }

  // 5. Send via ZApiClient
  const zapiClient = await ZApiClient.fromConfig();
  const sendResult = await zapiClient.sendText(contact.phone, messageText);

  // 6. Save the message as a WhatsAppMessage with sender: 'BOT'
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      sender: 'BOT',
      text: messageText,
      externalId: sendResult.key?.id || null,
      metadata: {
        automationEnrollmentId: enrollment.id,
        aiGenerated: true,
        prompt: config.prompt,
        objective: config.objective,
      },
    },
  });

  // Update conversation's lastMessageAt
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  return {
    success: true,
    output: {
      phone: contact.phone,
      conversationId: conversation.id,
      messageLength: messageText.length,
      aiModel: 'gpt-4o-mini',
    },
  };
}

async function markLost(
  contactId: string,
  config: { lostReasonId?: string }
): Promise<ActionResult> {
  // Find all OPEN deals for this contact
  const deals = await prisma.deal.findMany({
    where: {
      contactId,
      status: 'OPEN',
    },
  });

  if (deals.length === 0) {
    return { success: false, output: 'No open deals found for contact' };
  }

  const updateData: Record<string, unknown> = {
    status: 'LOST',
    closedAt: new Date(),
  };

  if (config.lostReasonId) {
    updateData.lostReasonId = config.lostReasonId;
  }

  for (const deal of deals) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: updateData,
    });
  }

  return {
    success: true,
    output: {
      dealsMarkedLost: deals.length,
      dealIds: deals.map((d) => d.id),
      lostReasonId: config.lostReasonId || null,
    },
  };
}
