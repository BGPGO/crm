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
import { requireAuth } from '../middleware/auth';

const router = Router();

// ─── Auth routes (no auth middleware needed for login/logout) ─────────────────
router.use('/auth', authRouter);

// ─── Public routes (no auth — tracking pixels, unsubscribe, webhooks) ────────
router.use('/email-tracking', emailTrackingRouter);

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

export default router;
