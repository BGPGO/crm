import { evaluateTriggers } from './automationEngine';

// ─── Trigger Listener Helpers ────────────────────────────────────────────────
//
// These functions should be called from existing route handlers to fire
// automation triggers. All are fire-and-forget: they do not block the caller.

export function onTagAdded(contactId: string, tagId: string): void {
  evaluateTriggers('TAG_ADDED', { contactId, metadata: { tagId } }).catch(
    (err) => console.error('[AutomationTrigger] onTagAdded failed:', err)
  );
}

export function onTagRemoved(contactId: string, tagId: string): void {
  evaluateTriggers('TAG_REMOVED', { contactId, metadata: { tagId } }).catch(
    (err) => console.error('[AutomationTrigger] onTagRemoved failed:', err)
  );
}

export function onStageChanged(contactId: string, stageId: string, dealId: string): void {
  evaluateTriggers('STAGE_CHANGED', { contactId, metadata: { stageId, dealId } }).catch(
    (err) => console.error('[AutomationTrigger] onStageChanged failed:', err)
  );
}

export function onContactCreated(contactId: string): void {
  evaluateTriggers('CONTACT_CREATED', { contactId }).catch(
    (err) => console.error('[AutomationTrigger] onContactCreated failed:', err)
  );
}

export function onFieldUpdated(contactId: string, field: string, value: string): void {
  evaluateTriggers('FIELD_UPDATED', { contactId, metadata: { field, value } }).catch(
    (err) => console.error('[AutomationTrigger] onFieldUpdated failed:', err)
  );
}
