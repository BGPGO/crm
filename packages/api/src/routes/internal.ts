/**
 * Internal endpoints called by Supabase Edge Functions.
 * Public (no auth) — the Edge Function runs server-side with env secrets.
 */

import { Router, Request, Response } from 'express';
import { sendLeadNotifications } from '../services/leadNotificationService';
import { onLeadCreated } from '../services/leadQualificationEngine';
import { onContactCreated, onStageChanged } from '../services/automationTriggerListener';

const router = Router();

// Default stage ID for "Lead" (first stage)
const DEFAULT_STAGE_ID = '64fb7516ea4eb400219457df';

/**
 * POST /api/internal/lead-created
 * Called by the Supabase Edge Function after creating a lead.
 * Triggers: email notification, automations, SDR IA qualification.
 */
router.post('/lead-created', async (req: Request, res: Response) => {
  try {
    const { contactId, dealId, contactName, contactEmail, contactPhone, sourceName, campaignName, landingPage } = req.body;

    if (!contactId || !dealId) {
      return res.status(400).json({ error: 'contactId and dealId are required' });
    }

    // Email notification to team
    sendLeadNotifications({
      dealId,
      contactName: contactName ?? 'Sem nome',
      contactEmail: contactEmail ?? null,
      contactPhone: contactPhone ?? null,
      sourceName: sourceName ?? null,
      campaignName: campaignName ?? null,
      utmUrl: landingPage ?? null,
    }).catch(err => console.error('[internal/lead-created] Notification error:', err));

    // Trigger automations
    onContactCreated(contactId);
    onStageChanged(contactId, DEFAULT_STAGE_ID, dealId);

    // Trigger lead qualification (Calendly check, SDR IA)
    onLeadCreated(contactId, dealId).catch(err => {
      console.error('[internal/lead-created] LeadQualification error:', err);
    });

    console.log(`[internal/lead-created] Triggered for contact=${contactId} deal=${dealId} name=${contactName}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[internal/lead-created] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
