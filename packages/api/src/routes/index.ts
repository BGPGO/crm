import { Router } from 'express';
import authRouter from './auth';
import contactsRouter from './contacts';
import organizationsRouter from './organizations';
import dealsRouter from './deals';
import pipelinesRouter from './pipelines';
import pipelineStagesRouter from './pipeline-stages';
import tasksRouter from './tasks';
import activitiesRouter from './activities';
import productsRouter from './products';
import dealProductsRouter from './deal-products';
import usersRouter from './users';
import teamsRouter from './teams';
import sourcesRouter from './sources';
import lostReasonsRouter from './lost-reasons';
import campaignsRouter from './campaigns';
import campaignContextsRouter from './campaign-contexts';
import customFieldsRouter from './custom-fields';
import webhooksRouter from './webhooks';
import webhookConfigsRouter from './webhook-configs';
import tagsRouter from './tags';
import segmentsRouter from './segments';
import leadScoresRouter from './lead-scores';
import contactImportsRouter from './contact-imports';
import emailTemplatesRouter from './email-templates';
import emailCampaignsRouter from './email-campaigns';
import emailTrackingRouter from './email-tracking';
import aiEmailRouter from './ai-email';
import automationsRouter from './automations';
import whatsappWebhookRouter from './whatsapp-webhook';
import whatsappConfigRouter from './whatsapp-config';
import whatsappInstanceRouter from './whatsapp-instance';
import whatsappConversationsRouter from './whatsapp-conversations';
import whatsappLeadsRouter from './whatsapp-leads';
import whatsappCampaignsRouter from './whatsapp-campaigns';
import whatsappFollowupRouter from './whatsapp-followup';
import whatsappTestChatRouter from './whatsapp-test-chat';
import calendlyWebhookRouter from './calendly-webhook';
import calendlyConfigRouter from './calendly-config';
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Auth routes (no auth middleware needed for login/logout) ─────────────────
router.use('/auth', authRouter);

// ─── Public routes (no auth — tracking pixels, unsubscribe, webhooks) ────────
router.use('/email-tracking', emailTrackingRouter);
router.use('/whatsapp/webhook', whatsappWebhookRouter);
router.use('/calendly/webhook', calendlyWebhookRouter);

// ─── Require auth for all other routes ───────────────────────────────────────
// All routes below this middleware require a valid authentication token.
router.use(requireAuth);

router.use('/contacts', contactsRouter);
router.use('/organizations', organizationsRouter);
router.use('/deals', dealsRouter);
router.use('/pipelines', pipelinesRouter);
router.use('/pipeline-stages', pipelineStagesRouter);
router.use('/tasks', tasksRouter);
router.use('/activities', activitiesRouter);
router.use('/products', productsRouter);
router.use('/deal-products', dealProductsRouter);
router.use('/users', usersRouter);
router.use('/teams', teamsRouter);
router.use('/sources', sourcesRouter);
router.use('/lost-reasons', lostReasonsRouter);
router.use('/campaigns', campaignsRouter);
router.use('/campaign-contexts', campaignContextsRouter);
router.use('/custom-fields', customFieldsRouter);
router.use('/webhooks', webhooksRouter);
router.use('/webhook-configs', webhookConfigsRouter);
router.use('/tags', tagsRouter);
router.use('/segments', segmentsRouter);
router.use('/lead-scores', leadScoresRouter);
router.use('/contact-imports', contactImportsRouter);
router.use('/email-templates', emailTemplatesRouter);
router.use('/email-campaigns', emailCampaignsRouter);
router.use('/ai', aiEmailRouter);
router.use('/automations', automationsRouter);
router.use('/whatsapp/config', whatsappConfigRouter);
router.use('/whatsapp/instance', whatsappInstanceRouter);
router.use('/whatsapp/conversations', whatsappConversationsRouter);
router.use('/whatsapp/leads', whatsappLeadsRouter);
router.use('/whatsapp/campaigns', whatsappCampaignsRouter);
router.use('/whatsapp/followup', whatsappFollowupRouter);
router.use('/whatsapp/test-chat', whatsappTestChatRouter);
router.use('/calendly/config', calendlyConfigRouter);

export default router;
