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
import { optionalAuth } from '../middleware/auth';

const router = Router();

// ─── Auth routes (no auth middleware needed for login/logout) ─────────────────
router.use('/auth', authRouter);

// ─── Optional auth for all other routes ──────────────────────────────────────
// Attaches req.user if a valid token is present, but doesn't block requests.
// Switch to requireAuth when ready to enforce authentication.
router.use(optionalAuth);

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

export default router;
