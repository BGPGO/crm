import prisma from '../lib/prisma';
import { Resend } from 'resend';
import { isUnsubscribed } from './unsubscribeManager';
import { wrapInBrandTemplate } from './emailTemplate';
import { ZApiClient } from '../services/zapiClient';
import OpenAI from 'openai';
import { canSend, registerSent } from './dailyLimitService';
import { normalizePhone } from '../utils/phoneNormalize';
import { interruptCadenceOnStageChange } from './cadenceInterruptService';

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActionResult {
  success: boolean;
  output?: any;
  conditionResult?: boolean; // for CONDITION type
  nextActionAt?: Date; // returned by WAIT action so the engine uses the fresh value
  retry?: boolean; // se true, engine não avança — tenta de novo no próximo ciclo
}

// ─── Action Executor ─────────────────────────────────────────────────────────

/**
 * Executes a single automation step action and returns the result.
 */
export async function executeAction(
  enrollment: any,
  step: any,
  options?: { generalContext?: string }
): Promise<ActionResult> {
  const config = step.config as any;

  try {
    switch (step.actionType) {
      case 'ADD_TAG':
        return await addTag(enrollment.contactId, config);

      case 'REMOVE_TAG':
        return await removeTag(enrollment.contactId, config);

      case 'SEND_EMAIL':
        return await sendEmail(enrollment.contactId, config, options?.generalContext);

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
        return await sendWhatsAppAI(enrollment, config, options?.generalContext);

      case 'MARK_LOST':
        return await markLost(enrollment.contactId, config);

      case 'WAIT_FOR_RESPONSE':
        return await waitForResponse(config);

      case 'SEND_WA_TEMPLATE':
        return await sendWaTemplate(enrollment.contactId, config);

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

function buildBrandedEmail(firstName: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr><td style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 100%); padding:28px 32px; text-align:center;">
          <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Bertuzzi Patrimonial</h1>
          <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;">Soluções Financeiras</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 32px 24px;">
          ${firstName ? `<p style="margin:0 0 20px;font-size:16px;color:#1e3a5f;font-weight:600;">Olá, ${firstName}!</p>` : ''}
          <div style="font-size:15px;color:#3d4852;">
            ${bodyHtml}
          </div>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e8ecf1;margin:0;"></td></tr>
        <!-- Signature -->
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1e3a5f;">Equipe Bertuzzi Patrimonial</p>
          <p style="margin:0;font-size:13px;color:#8795a1;">GoBI · Inteligência Financeira para Empresas</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background-color:#f8f9fb;padding:20px 32px;text-align:center;border-top:1px solid #e8ecf1;">
          <p style="margin:0;font-size:11px;color:#b0b7c3;">Este email foi enviado por Bertuzzi Patrimonial BGPGO.</p>
          <p style="margin:4px 0 0;font-size:11px;color:#b0b7c3;">Se não deseja mais receber nossos emails, responda com "SAIR".</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(
  contactId: string,
  config: { templateId?: string; subject?: string; prompt?: string; isAIGenerated?: boolean },
  generalContext?: string
): Promise<ActionResult> {
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: { organization: { select: { name: true } } },
  });

  if (!contact.email) {
    return { success: false, output: 'Contact has no email address' };
  }

  // Check if the contact has unsubscribed before sending
  if (await isUnsubscribed(contact.email)) {
    return { success: false, output: 'Contact unsubscribed' };
  }

  let subject: string;
  let htmlContent: string;

  if (config.isAIGenerated && config.prompt) {
    // AI-generated email content
    const waConfig = await prisma.whatsAppConfig.findFirst({ select: { openaiApiKey: true } });
    const openaiKey = waConfig?.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!openaiKey) return { success: false, output: 'OpenAI API key not configured for AI email' };

    const openai = new OpenAI({ apiKey: openaiKey });
    const sector = (contact as any).sector || '';
    const orgName = (contact as any).organization?.name || '';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um redator de emails profissionais da Bertuzzi Patrimonial (BGPGO).
Gere APENAS o corpo do email em texto simples (parágrafos). NÃO use HTML, NÃO use markdown, NÃO use code blocks.
Escreva parágrafos separados por linha em branco. O sistema vai formatar automaticamente.
Nome do contato: ${contact.name || ''}
Setor: ${sector || 'Não informado'}
Empresa: ${orgName || 'Não informada'}
${sector ? `Adapte o conteúdo para o setor "${sector}".` : 'Use conteúdo genérico sobre gestão financeira.'}
Produto: GoBI (BI financeiro). A reunião é de Diagnóstico Financeiro (20 min).
NÃO inclua assinatura — ela é adicionada automaticamente.${generalContext ? `\n\nCONTEXTO GERAL DA CADÊNCIA:\n${generalContext}` : ''}`,
        },
        { role: 'user', content: config.prompt },
      ],
      max_tokens: 600,
      temperature: 0.7,
    });

    let rawContent = completion.choices[0]?.message?.content || 'Conteúdo não disponível';

    // Strip markdown code blocks if AI wraps in ```html ... ```
    rawContent = rawContent.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    // Convert plain text paragraphs to HTML
    const paragraphs = rawContent.split(/\n\n+/).map(p => p.trim()).filter(p => p);
    const firstName = (contact.name || '').split(' ')[0] || '';
    const greeting = firstName ? `<p style="margin:0 0 20px;font-size:16px;color:#1e3a5f;font-weight:600;">Olá, ${firstName}!</p>` : '';
    const bodyHtml = greeting + paragraphs.map(p => `<p style="margin: 0 0 16px 0; line-height: 1.6;">${p.replace(/\n/g, '<br>')}</p>`).join('');

    // Build unsubscribe URL for branded template (email-based, no token needed for automations)
    const apiBaseForUnsub = process.env.API_URL || 'http://localhost:3001/api';
    const emailB64 = Buffer.from(contact.email, 'utf-8').toString('base64url');
    const unsubUrlForTemplate = `${apiBaseForUnsub.replace('/api', '')}/api/unsubscribe/email/${emailB64}`;

    // Wrap in the same branded template used by campaigns
    htmlContent = wrapInBrandTemplate(bodyHtml, unsubUrlForTemplate);
    subject = config.subject || 'BGPGO — Informações para você';
  } else if (config.templateId) {
    // Template-based email — already wrapped if created via the template editor
    const template = await prisma.emailTemplate.findUniqueOrThrow({
      where: { id: config.templateId },
    });
    subject = template.subject || template.name;
    htmlContent = template.htmlContent;
  } else {
    return { success: false, output: 'No email template or AI prompt provided' };
  }

  // Build unsubscribe URL for List-Unsubscribe header
  const apiBase = process.env.API_URL || 'http://localhost:3001/api';
  const emailB64Header = Buffer.from(contact.email, 'utf-8').toString('base64url');
  const unsubUrl = `${apiBase.replace('/api', '')}/api/unsubscribe/email/${emailB64Header}`;

  const result = await resend.emails.send({
    from: `BGPGO CRM <noreply@bertuzzipatrimonial.app.br>`,
    to: contact.email,
    subject,
    html: htmlContent,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });

  // Throttle: small delay between automation emails to prevent rate limiting
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    success: true,
    output: { messageId: result.data?.id, templateId: config.templateId || 'ai-generated', subject },
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
  'name', 'phone', 'position', 'notes', 'city', 'state', 'sector',
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
  // Follow-ups de cadência são para contatos já cadastrados — risco baixo de ban.
  // Hard block só se aplica a sdrFirstContact (cold outreach), verificado em canSend().
  if (!await canSend('followUp')) {
    return { success: false, output: 'Daily WhatsApp limit reached' };
  }

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: { organization: { select: { name: true } } },
  });

  if (!contact.phone) {
    return { success: false, output: 'Contact has no phone number' };
  }

  const normalizedPhone = normalizePhone(contact.phone);

  // Verificar opt-out antes de enviar WhatsApp
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { phone: normalizedPhone },
    select: { optedOut: true, id: true },
  });
  if (conversation?.optedOut) {
    return { success: false, output: 'Contact opted out of WhatsApp messages' };
  }

  // Check contato frio: se já existe conversa, verificar se o contato já respondeu alguma vez
  if (conversation) {
    const hasEverReplied = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: conversation.id, sender: 'CLIENT' },
      select: { id: true },
    });
    if (!hasEverReplied) {
      // Contato frio: contar apenas msgs do BOT (msgs humanas manuais não devem consumir o limite)
      const botMsgCount = await prisma.whatsAppMessage.count({
        where: { conversationId: conversation.id, sender: 'BOT' },
      });
      const coldCfg = await prisma.whatsAppConfig.findFirst({ select: { coldContactMaxMessages: true } });
      const coldLimit = coldCfg?.coldContactMaxMessages ?? 5;
      if (botMsgCount >= coldLimit) {
        console.log(`[sendWhatsApp] Contato frio: ${botMsgCount}/${coldLimit} msgs enviadas sem resposta para ${normalizedPhone} — pulando`);
        return { success: false, output: `Cold contact: ${botMsgCount} messages sent without any reply, skipping` };
      }
    }
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
      .replace(/\{\{estado\}\}/gi, (contact as any).state || '')
      .replace(/\{\{setor\}\}/gi, (contact as any).sector || '')
      .replace(/\{\{empresa\}\}/gi, (contact as any).organization?.name || '');
  } else if (config.customMessage) {
    messageText = config.customMessage
      .replace(/\{\{nome\}\}/gi, contact.name || '')
      .replace(/\{\{email\}\}/gi, contact.email || '')
      .replace(/\{\{telefone\}\}/gi, contact.phone || '')
      .replace(/\{\{cidade\}\}/gi, (contact as any).city || '')
      .replace(/\{\{estado\}\}/gi, (contact as any).state || '')
      .replace(/\{\{setor\}\}/gi, (contact as any).sector || '')
      .replace(/\{\{empresa\}\}/gi, (contact as any).organization?.name || '');
  } else {
    return { success: false, output: 'No message template or custom message provided' };
  }

  // Reopen conversation if closed + update lastMessageAt
  await prisma.whatsAppConversation.updateMany({
    where: { phone: normalizedPhone },
    data: { status: 'open', isActive: true, lastMessageAt: new Date() },
  }).catch(() => {});

  // Save message to conversation history
  let conv = await prisma.whatsAppConversation.findUnique({ where: { phone: normalizedPhone } });
  if (!conv) {
    conv = await prisma.whatsAppConversation.create({
      data: { phone: normalizedPhone, contactId, isActive: true, status: 'open' },
    });
  }
  await prisma.whatsAppMessage.create({
    data: {
      conversationId: conv.id,
      sender: 'BOT',
      text: messageText,
    },
  });

  // Send via Evolution API
  const { EvolutionApiClient } = await import('./evolutionApiClient');
  const client = await EvolutionApiClient.fromConfig();
  await client.sendText(normalizedPhone, messageText);

  // Registrar envio no controle de volume diário
  await registerSent('followUp');

  return {
    success: true,
    output: {
      phone: contact.phone,
      conversationId: conv.id,
      messageLength: messageText.length,
      templateId: config.messageTemplateId || null,
    },
  };
}

async function movePipelineStage(
  contactId: string,
  config: { stageId: string }
): Promise<ActionResult> {
  // Buscar a etapa alvo pra saber a ordem
  const targetStage = await prisma.pipelineStage.findUnique({
    where: { id: config.stageId },
    select: { order: true, pipelineId: true },
  });

  // Find the contact's active deals and move them to the target stage
  const deals = await prisma.deal.findMany({
    where: {
      contactId,
      status: 'OPEN',
    },
    include: { stage: { select: { order: true } } },
  });

  if (deals.length === 0) {
    return { success: false, output: 'No active deals found for contact' };
  }

  const moved: string[] = [];
  const skipped: string[] = [];

  for (const deal of deals) {
    // Não regredir deals que já estão em etapas posteriores
    if (targetStage && deal.stage && deal.stage.order > targetStage.order) {
      skipped.push(deal.id);
      continue;
    }
    await prisma.deal.update({
      where: { id: deal.id },
      data: { stageId: config.stageId },
    });
    moved.push(deal.id);
  }

  return {
    success: true,
    output: {
      stageId: config.stageId,
      dealsUpdated: moved.length,
      dealIds: moved,
      ...(skipped.length > 0 ? { skippedDealIds: skipped, skippedReason: 'deal já está em etapa posterior' } : {}),
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

  // ── Special fields that need real lookups ───────────────────────────────
  if (config.field === 'meeting_scheduled') {
    // Check WhatsAppConversation.meetingBooked OR CalendlyEvent existence
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { contactId },
    });
    const hasMeetingInConv = conversation?.meetingBooked === true;

    const calendlyEvent = await prisma.calendlyEvent.findFirst({
      where: { contactId, status: 'active' },
    });
    const hasMeeting = hasMeetingInConv || !!calendlyEvent;
    const conditionResult = config.operator === 'is_true' ? hasMeeting : !hasMeeting;

    return {
      success: true,
      conditionResult,
      output: {
        field: 'meeting_scheduled',
        operator: config.operator,
        actual: hasMeeting ? 'Sim' : 'Não',
        meetingBookedInConv: hasMeetingInConv,
        hasCalendlyEvent: !!calendlyEvent,
        result: conditionResult,
      },
    };
  }

  if (config.field === 'lead_responded') {
    // Check if there are CLIENT messages in the WhatsApp conversation
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { contactId },
    });
    let hasResponded = false;
    if (conversation) {
      const clientMsgCount = await prisma.whatsAppMessage.count({
        where: { conversationId: conversation.id, sender: 'CLIENT' },
      });
      hasResponded = clientMsgCount > 0;
    }
    const conditionResult = config.operator === 'is_true' ? hasResponded : !hasResponded;

    return {
      success: true,
      conditionResult,
      output: {
        field: 'lead_responded',
        operator: config.operator,
        actual: hasResponded ? 'Sim' : 'Não',
        result: conditionResult,
      },
    };
  }

  if (config.field === 'has_tag') {
    // Check if contact has a specific tag (by name or ID)
    const contactTags = await prisma.contactTag.findMany({
      where: { contactId },
      include: { tag: { select: { id: true, name: true } } },
    });
    const tagNames = contactTags.map(ct => ct.tag.name.toLowerCase());
    const tagIds = contactTags.map(ct => ct.tag.id);
    const searchValue = (config.value || '').toLowerCase();

    const hasTag = tagIds.includes(config.value) || tagNames.includes(searchValue);

    let conditionResult: boolean;
    if (config.operator === 'is_true') conditionResult = hasTag;
    else if (config.operator === 'is_false') conditionResult = !hasTag;
    else if (config.operator === 'equals') conditionResult = hasTag;
    else conditionResult = hasTag;

    return {
      success: true,
      conditionResult,
      output: {
        field: 'has_tag',
        operator: config.operator,
        expected: config.value,
        actual: tagNames.join(', ') || 'Nenhuma tag',
        result: conditionResult,
      },
    };
  }

  if (config.field === 'sector') {
    const fieldValue = (contact as any).sector || '';
    let conditionResult = false;
    switch (config.operator) {
      case 'equals': case 'eq': conditionResult = fieldValue.toLowerCase() === (config.value || '').toLowerCase(); break;
      case 'not_equals': case 'neq': conditionResult = fieldValue.toLowerCase() !== (config.value || '').toLowerCase(); break;
      case 'contains': conditionResult = fieldValue.toLowerCase().includes((config.value || '').toLowerCase()); break;
      case 'is_empty': conditionResult = !fieldValue; break;
      case 'is_not_empty': conditionResult = !!fieldValue; break;
      default: conditionResult = false;
    }
    return {
      success: true, conditionResult,
      output: { field: 'sector', operator: config.operator, expected: config.value, actual: fieldValue || 'Não informado', result: conditionResult },
    };
  }

  if (config.field === 'deal_stage') {
    const deal = await prisma.deal.findFirst({
      where: { contactId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      include: { stage: { select: { id: true, name: true } } },
    });
    const stageId = deal?.stageId || '';
    const stageName = deal?.stage?.name || '';
    const matchesId = stageId === config.value;
    const matchesName = stageName.toLowerCase() === (config.value || '').toLowerCase();
    const conditionResult = config.operator === 'equals' || config.operator === 'eq'
      ? matchesId || matchesName
      : !(matchesId || matchesName);
    return {
      success: true, conditionResult,
      output: { field: 'deal_stage', operator: config.operator, expected: config.value, actual: stageName || 'Sem deal aberta', stageId, result: conditionResult },
    };
  }

  if (config.field === 'has_email') {
    const hasEmail = !!contact.email && contact.email.trim().length > 0;
    const conditionResult = config.operator === 'is_true' ? hasEmail : !hasEmail;
    return {
      success: true, conditionResult,
      output: { field: 'has_email', operator: config.operator, actual: hasEmail ? 'Sim' : 'Não', result: conditionResult },
    };
  }

  if (config.field === 'days_in_stage') {
    const deal = await prisma.deal.findFirst({
      where: { contactId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { updatedAt: true },
    });
    const daysInStage = deal ? Math.floor((Date.now() - new Date(deal.updatedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const targetDays = parseInt(config.value || '0', 10);
    let conditionResult = false;
    switch (config.operator) {
      case 'equals': case 'eq': conditionResult = daysInStage === targetDays; break;
      case 'greater_than': case 'gt': conditionResult = daysInStage > targetDays; break;
      case 'less_than': case 'lt': conditionResult = daysInStage < targetDays; break;
      default: conditionResult = false;
    }
    return {
      success: true, conditionResult,
      output: { field: 'days_in_stage', operator: config.operator, expected: targetDays, actual: daysInStage, result: conditionResult },
    };
  }

  if (config.field === 'expected_return_date') {
    const deal = await prisma.deal.findFirst({
      where: { contactId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      select: { expectedReturnDate: true },
    });
    const hasDate = !!deal?.expectedReturnDate;
    if (config.operator === 'is_not_empty') {
      return { success: true, conditionResult: hasDate, output: { field: 'expected_return_date', operator: config.operator, actual: hasDate ? deal!.expectedReturnDate!.toISOString() : 'Não definida', result: hasDate } };
    }
    if (config.operator === 'is_empty') {
      return { success: true, conditionResult: !hasDate, output: { field: 'expected_return_date', operator: config.operator, actual: hasDate ? 'Definida' : 'Não definida', result: !hasDate } };
    }
    // Check days until return date
    if (hasDate) {
      const daysUntil = Math.ceil((new Date(deal!.expectedReturnDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const targetDays = parseInt(config.value || '1', 10);
      let conditionResult = false;
      switch (config.operator) {
        case 'equals': case 'eq': conditionResult = daysUntil === targetDays; break;
        case 'less_than': case 'lt': conditionResult = daysUntil < targetDays; break;
        case 'less_than_or_equal': case 'lte': conditionResult = daysUntil <= targetDays; break;
        default: conditionResult = false;
      }
      return { success: true, conditionResult, output: { field: 'expected_return_date', operator: config.operator, expected: targetDays, actual: daysUntil, returnDate: deal!.expectedReturnDate!.toISOString(), result: conditionResult } };
    }
    return { success: true, conditionResult: false, output: { field: 'expected_return_date', operator: config.operator, actual: 'Não definida', result: false } };
  }

  // ── Generic contact field comparison ────────────────────────────────────
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
    case 'is_empty':
      conditionResult = fieldValue === '' || fieldValue === 'null' || fieldValue === 'undefined';
      break;
    case 'is_not_empty':
      conditionResult = fieldValue !== '' && fieldValue !== 'null' && fieldValue !== 'undefined';
      break;
    case 'is_true':
      conditionResult = fieldValue === 'true' || fieldValue === '1';
      break;
    case 'is_false':
      conditionResult = fieldValue === 'false' || fieldValue === '0' || fieldValue === '';
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
  config: { prompt: string; objective: string },
  generalContext?: string
): Promise<ActionResult> {
  // IA de cadência responde a leads já captados — risco baixo de ban.
  // Hard block só se aplica a sdrFirstContact (cold outreach), verificado em canSend().
  if (!await canSend('followUp')) {
    return { success: false, output: 'Daily WhatsApp limit reached' };
  }

  // 1. Find the contact's phone
  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: enrollment.contactId },
    include: { organization: { select: { name: true } } },
  });

  if (!contact.phone) {
    return { success: false, output: 'Contact has no phone number' };
  }

  const normalizedPhoneAI = normalizePhone(contact.phone);

  // Verificar opt-out antes de enviar WhatsApp IA
  const optOutCheckAI = await prisma.whatsAppConversation.findUnique({
    where: { phone: normalizedPhoneAI },
    select: { optedOut: true, id: true },
  });
  if (optOutCheckAI?.optedOut) {
    return { success: false, output: 'Contact opted out of WhatsApp messages' };
  }

  // Check contato frio: se já existe conversa, verificar se o contato já respondeu alguma vez
  if (optOutCheckAI) {
    const hasEverReplied = await prisma.whatsAppMessage.findFirst({
      where: { conversationId: optOutCheckAI.id, sender: 'CLIENT' },
      select: { id: true },
    });
    if (!hasEverReplied) {
      // Contato frio: contar apenas msgs do BOT (msgs humanas manuais não devem consumir o limite)
      const botMsgCount = await prisma.whatsAppMessage.count({
        where: { conversationId: optOutCheckAI.id, sender: 'BOT' },
      });
      const coldCfg = await prisma.whatsAppConfig.findFirst({ select: { coldContactMaxMessages: true } });
      const coldLimit = coldCfg?.coldContactMaxMessages ?? 5;
      if (botMsgCount >= coldLimit) {
        console.log(`[sendWhatsAppAI] Contato frio: ${botMsgCount}/${coldLimit} msgs enviadas sem resposta para ${normalizedPhoneAI} — pulando`);
        return { success: false, output: `Cold contact: ${botMsgCount} messages sent without any reply, skipping` };
      }
    }
  }

  // 2. Find or create WhatsAppConversation for this phone
  let conversation = await prisma.whatsAppConversation.findUnique({
    where: { phone: normalizedPhoneAI },
  });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        phone: normalizedPhoneAI,
        contactId: contact.id,
        isActive: true,
        status: 'open',
      },
    });
  } else if (conversation.status === 'closed') {
    // Reopen closed conversation when automation sends a message
    conversation = await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { status: 'open', isActive: true, lastMessageAt: new Date() },
    });
  }

  // 3. Get OpenAI API key from WhatsApp config
  const waConfig = await prisma.whatsAppConfig.findFirst();
  const openaiKey = waConfig?.openaiApiKey || process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return { success: false, output: 'OpenAI API key not configured' };
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  // 4. Load conversation history for continuity
  const recentMessages = await prisma.whatsAppMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { sender: true, text: true },
  });
  const historyLines = recentMessages
    .reverse()
    .map((m) => `${m.sender === 'CLIENT' ? 'LEAD' : 'VOCÊ'}: ${m.text}`)
    .join('\n');

  // 5. Generate AI message using the prompt, objective, and conversation history
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Você é um assistente de vendas da BGPGO. Seu objetivo: ${config.objective}\n\nInstruções: ${config.prompt}\n${generalContext ? `\nCONTEXTO GERAL DA CADÊNCIA:\n${generalContext}\n` : ''}\nNome do contato: ${contact.name}\nEmail: ${contact.email || 'N/A'}\nTelefone: ${contact.phone}\nSetor: ${(contact as any).sector || 'Não informado'}\nEmpresa: ${(contact as any).organization?.name || 'Não informada'}\n\nIMPORTANTE: Você já está em contato com este lead. NÃO se apresente novamente. NÃO diga "Olá, sou..." se já houve mensagens anteriores. Dê continuidade à conversa de forma natural.${historyLines ? `\n\nHISTÓRICO DA CONVERSA:\n${historyLines}` : ''}`,
      },
      {
        role: 'user',
        content: 'Gere a próxima mensagem de WhatsApp para este contato, dando continuidade à conversa. Responda APENAS com o texto da mensagem, sem aspas ou formatação extra.',
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
  const sendResult = await zapiClient.sendText(normalizedPhoneAI, messageText);

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

  // Save to AIHistory so the bot has continuity when the lead replies
  await prisma.whatsAppAIHistory.create({
    data: {
      conversationId: conversation.id,
      role: 'assistant',
      content: messageText,
    },
  });

  // Update conversation's lastMessageAt
  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  // Registrar envio no controle de volume diário
  await registerSent('followUp');

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

async function waitForResponse(
  config: { waitHours: number; channel: 'whatsapp' | 'email' | 'any' }
): Promise<ActionResult> {
  const waitHours = config.waitHours || 24;
  const channel = config.channel || 'any';
  const nextActionDelay = waitHours * 60; // in minutes

  const now = new Date();
  const nextActionAt = new Date(now.getTime() + nextActionDelay * 60 * 1000);

  console.log(`[AutomationActions] Aguardando resposta por ${waitHours}h (canal: ${channel})`);

  return {
    success: true,
    output: {
      awaitingResponse: true,
      awaitingSince: now.toISOString(),
      channel,
      responseReceived: false,
      waitHours,
      waitUntil: nextActionAt.toISOString(),
    },
    nextActionAt,
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

  // Interrupt active cadences and complete orphaned tasks
  try {
    await interruptCadenceOnStageChange(contactId, null);

    await prisma.task.updateMany({
      where: {
        deal: { contactId, status: 'LOST' },
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      data: { status: 'COMPLETED' },
    });

    console.log(`[markLost] Cadencias interrompidas e tarefas concluidas para contato ${contactId}`);
  } catch (err) {
    console.error(`[markLost] Erro ao interromper cadencias/tarefas para contato ${contactId}:`, err);
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

async function sendWaTemplate(
  contactId: string,
  config: { templateName: string; language?: string }
): Promise<ActionResult> {
  if (!config.templateName) {
    return { success: false, output: 'templateName is required in action config' };
  }

  // Verificar se o template está APPROVED antes de tentar enviar.
  // Se está PENDING (em aprovação), retorna retry pra manter o step em espera.
  const language = config.language || 'pt_BR';
  const templateStatus = await prisma.cloudWaTemplate.findFirst({
    where: { name: config.templateName, language },
    select: { status: true },
  });

  if (!templateStatus) {
    return { success: false, output: `Template "${config.templateName}" não encontrado no banco` };
  }

  if (templateStatus.status !== 'APPROVED') {
    return {
      success: false,
      retry: true, // sinaliza pro engine NÃO avançar — tentar de novo no próximo ciclo
      output: `Template "${config.templateName}" não está aprovado (status: ${templateStatus.status}) — aguardando aprovação`,
    };
  }

  // ── Verificar limite de gasto diário WABA ──
  const { getDailySpend } = await import('../utils/wabaSpendLimit');
  const spend = await getDailySpend();
  if (spend.exceeded) {
    console.log(`[sendWaTemplate] Limite diário WABA atingido: R$${spend.totalCost} / R$${spend.limitBRL} — congelando automação`);
    return {
      success: false,
      retry: true, // reagenda — vai tentar de novo no próximo ciclo (amanhã o limite reseta)
      output: `Limite diário WABA atingido (R$${spend.totalCost}/${spend.limitBRL}) — automação congelada`,
    };
  }

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
  });

  if (!contact.phone) {
    return { success: false, output: 'Contact has no phone number' };
  }

  // Skip contacts already marked as phoneInvalid — no point wasting templates
  if (contact.phoneInvalid) {
    return { success: false, output: `Contato ${contact.name} tem telefone marcado como invalido — envio bloqueado` };
  }

  const phone = normalizePhone(contact.phone);

  // Check opt-out on WaConversation
  const { phoneVariants } = await import('../utils/phoneNormalize');
  const variants = phoneVariants(phone);

  let conversation = await prisma.waConversation.findFirst({
    where: { phone: { in: variants } },
    select: { id: true, optedOut: true },
  });

  if (conversation?.optedOut) {
    return { success: false, output: 'Contact opted out of WhatsApp messages' };
  }

  // Find or create WaConversation for this phone
  if (!conversation) {
    conversation = await prisma.waConversation.create({
      data: {
        phone,
        status: 'WA_OPEN',
        contactId,
      },
      select: { id: true, optedOut: true },
    });
  }

  // Resolve variáveis do template usando o mapeamento configurado
  const { resolveTemplateVariables } = await import('../utils/templateVariableResolver');

  // Buscar mapeamento do template
  const templateRecord = await prisma.cloudWaTemplate.findFirst({
    where: { name: config.templateName, language: language },
    select: { variableMapping: true },
  });

  const resolved = await resolveTemplateVariables(
    templateRecord?.variableMapping as any,
    { contactId, dealId: undefined },
  );

  // Se tem variáveis obrigatórias faltando (ex: meeting.time sem reunião), pula o envio
  if (resolved.missingVars.length > 0) {
    const missing = resolved.missingVars.map(v => `${v.var}=${v.source}`).join(', ');
    return { success: false, output: `Template ${config.templateName} não enviado — dados faltando: ${missing}` };
  }

  const components = resolved.parameters.length > 0
    ? [{ type: 'body', parameters: resolved.parameters }]
    : [];

  // ── Helper: detect & handle invalid phone errors ──
  // Meta error codes: 131026 = phone not on WhatsApp, 131051 = number doesn't exist,
  // 131052 = media not supported by recipient (sometimes indicates invalid)
  const INVALID_PHONE_CODES = [131026, 131051];

  async function handleInvalidPhoneError(err: any): Promise<void> {
    const metaCode = err?.metaCode;
    const msg = (err?.message || '').toLowerCase();

    const isDefinitiveInvalid =
      INVALID_PHONE_CODES.includes(metaCode) ||
      (msg.includes('numero nao possui whatsapp')) ||
      (msg.includes('invalido') && (msg.includes('phone') || msg.includes('recipient')));

    if (!isDefinitiveInvalid) return; // Not an invalid phone error — let caller handle

    console.log(`[sendWaTemplate] Telefone invalido detectado (metaCode=${metaCode}) — contactId=${contactId}, phone=${phone}`);

    try {
      // 1. Mark contact as phoneInvalid
      await prisma.contact.update({
        where: { id: contactId },
        data: { phoneInvalid: true, phoneInvalidAt: new Date() },
      });

      // 2. Tag the contact with "Numero Invalido"
      const tag = await prisma.tag.upsert({
        where: { name: 'Numero Invalido' },
        update: {},
        create: { name: 'Numero Invalido', color: '#ef4444' },
      });
      await prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId, tagId: tag.id } },
        update: {},
        create: { contactId, tagId: tag.id },
      });

      console.log(`[sendWaTemplate] Contato ${contactId} marcado como telefone invalido + tag aplicada`);
    } catch (markErr) {
      console.error(`[sendWaTemplate] Erro ao marcar telefone invalido:`, markErr);
    }
  }

  // ── Smart Send: texto livre se janela 24h aberta, template se fechada ──
  const { WaMessageService } = await import('./wa/messageService');
  const { WindowService } = await import('./wa/windowService');

  const windowOpen = await WindowService.isWindowOpenSafe(conversation.id);

  if (windowOpen) {
    // Janela aberta → enviar corpo do template como texto livre (custo zero)
    const templateBody = await prisma.cloudWaTemplate.findFirst({
      where: { name: config.templateName, language },
      select: { body: true },
    });

    if (templateBody?.body) {
      // Substituir {{1}}, {{2}}, ... pelos valores resolvidos
      let freeText = templateBody.body;
      resolved.parameters.forEach((param: { type: string; text: string }, idx: number) => {
        freeText = freeText.replace(`{{${idx + 1}}}`, param.text);
      });

      try {
        const result = await WaMessageService.sendText(
          conversation.id,
          freeText,
          { senderType: 'WA_BOT' },
        );

        console.log(`[sendWaTemplate] Smart send: texto livre enviado (janela aberta) — economizou template ${config.templateName}`);
        return {
          success: true,
          output: {
            phone,
            conversationId: conversation.id,
            templateName: config.templateName,
            language,
            smartSend: 'free_text',
            messageId: result?.id || null,
          },
        };
      } catch (err: any) {
        // Erro 131047 = janela fechou entre o check e o envio → fallback pra template
        const metaCode = err?.metaCode || err?.response?.data?.error?.code;
        if (metaCode === 131047) {
          console.log(`[sendWaTemplate] Smart send fallback: janela fechou, enviando template ${config.templateName}`);
        } else {
          // Check for invalid phone before re-throwing
          await handleInvalidPhoneError(err);
          throw err; // Propagate — engine will mark enrollment as FAILED
        }
      }
    }
  }

  // Fallback: enviar template normalmente (janela fechada ou smart send falhou)
  try {
    const result = await WaMessageService.sendTemplate(
      conversation.id,
      config.templateName,
      language,
      components,
      { senderType: 'WA_BOT' },
    );

    return {
      success: true,
      output: {
        phone,
        conversationId: conversation.id,
        templateName: config.templateName,
        language,
        smartSend: windowOpen ? 'fallback_template' : 'template',
        messageId: result?.id || null,
      },
    };
  } catch (err: any) {
    // Check for invalid phone before re-throwing
    await handleInvalidPhoneError(err);
    throw err; // Propagate — engine will mark enrollment as FAILED
  }
}
