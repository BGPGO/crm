import prisma from '../lib/prisma';
import { executeAction } from './automationActions';

// ─── Throttle config for WhatsApp sends ─────────────────────────────────────
// WABA (Cloud API) não tem risco de ban — Meta gerencia rate limits via tier.
// Throttle mantido apenas pra não sobrecarregar a API da Meta de uma vez.
const WHATSAPP_MAX_PER_CYCLE = 25;  // max WhatsApp messages per cron tick
const WHATSAPP_MIN_DELAY_S = 3;     // min seconds between sends
const WHATSAPP_MAX_DELAY_S = 8;     // max seconds between sends

// ─── Trigger Evaluation ──────────────────────────────────────────────────────

/**
 * Finds all ACTIVE automations matching the given triggerType,
 * checks if the contact matches the triggerConfig, and enrolls
 * the contact if not already enrolled.
 */
export async function evaluateTriggers(
  triggerType: string,
  data: { contactId: string; metadata?: any }
): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: {
      status: 'ACTIVE',
      triggerType: triggerType as any,
    },
    include: {
      steps: {
        orderBy: { order: 'asc' },
      },
    },
  });

  console.log(`[AutomationEngine] evaluateTriggers ${triggerType} — ${automations.length} automations ACTIVE, contactId=${data.contactId}, metadata=${JSON.stringify(data.metadata || {})}`);

  // Pre-check cadence flags (Z-API cadences need cadenceEnabled; WABA cadences always run)
  let cadenceEnabledChecked = false;
  let cadenceEnabled = false;

  for (const automation of automations) {
    const triggerConfig = automation.triggerConfig as any;

    // Determine if this is a WABA automation (has SEND_WA_TEMPLATE steps)
    const isWabaAutomation = automation.steps.some(
      (s) => s.actionType === 'SEND_WA_TEMPLATE'
    );

    // Skip Z-API cadence automations if cadences are disabled
    // WABA cadences always run regardless of the flag
    if (triggerConfig?.isCadence && !isWabaAutomation) {
      if (!cadenceEnabledChecked) {
        const waConfig = await prisma.whatsAppConfig.findFirst({ select: { cadenceEnabled: true } });
        cadenceEnabled = waConfig?.cadenceEnabled === true;
        cadenceEnabledChecked = true;
      }
      if (!cadenceEnabled) continue;
    }

    // Check if the contact matches the trigger config
    const matches = doesTriggerMatch(triggerType, triggerConfig, data.metadata);
    console.log(`[AutomationEngine]   → "${automation.name}" kind=${triggerConfig?.kind || 'N/A'} isCadence=${triggerConfig?.isCadence || false} match=${matches} stageId=${triggerConfig?.stageId}`);
    if (!matches) continue;

    // Find the root step (not referenced by any other step)
    const referencedIds = new Set<string>();
    automation.steps.forEach((s) => {
      if (s.nextStepId) referencedIds.add(s.nextStepId);
      if (s.trueStepId) referencedIds.add(s.trueStepId);
      if (s.falseStepId) referencedIds.add(s.falseStepId);
    });
    const firstStep = automation.steps.find((s) => !referencedIds.has(s.id))
      || automation.steps.find((s) => s.order === 0)
      || automation.steps[0];
    if (!firstStep) continue;

    // Atomic check-and-create inside a serializable transaction to prevent
    // race conditions when multiple triggers fire simultaneously (e.g.
    // CONTACT_CREATED + STAGE_CHANGED both in parallel).
    let enrolled = false;
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.automationEnrollment.findFirst({
          where: {
            automationId: automation.id,
            contactId: data.contactId,
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
        });
        if (existing) return; // already enrolled — skip

        await tx.automationEnrollment.create({
          data: {
            automationId: automation.id,
            contactId: data.contactId,
            status: 'ACTIVE',
            currentStepId: firstStep.id,
            nextActionAt: new Date(),
          },
        });
        enrolled = true;
      }, { isolationLevel: 'Serializable' });
    } catch (txErr: any) {
      // Serialization failure = another transaction already enrolled this contact
      if (txErr.code === 'P2034' || txErr.message?.includes('could not serialize')) {
        console.log(`[AutomationEngine] Serialization conflict for ${automation.name} + contact ${data.contactId} — already enrolled`);
        continue;
      }
      console.error(`[AutomationEngine] ❌ Enrollment FAILED for "${automation.name}" contact=${data.contactId}:`, txErr.message || txErr);
      throw txErr;
    }

    console.log(`[AutomationEngine]   → ${enrolled ? '✅ ENROLLED' : '⏭️ SKIPPED (already enrolled)'} "${automation.name}" contact=${data.contactId}`);

    if (!enrolled) continue;

    // Log activity on the contact's most recent open deal
    try {
      const deal = await prisma.deal.findFirst({
        where: { contactId: data.contactId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (deal) {
        await prisma.activity.create({
          data: {
            type: 'AUTOMATION_ENROLLED',
            content: `Cadência iniciada: ${automation.name}`,
            dealId: deal.id,
            contactId: data.contactId,
            userId: 'system',
          },
        });
      }
    } catch {
      // Non-critical — don't block enrollment
    }
  }
}

/**
 * Checks if the trigger config matches the incoming metadata.
 */
function doesTriggerMatch(
  triggerType: string,
  triggerConfig: any,
  metadata?: any
): boolean {
  switch (triggerType) {
    case 'TAG_ADDED':
    case 'TAG_REMOVED':
      return metadata?.tagId === triggerConfig?.tagId;

    case 'STAGE_CHANGED':
      return metadata?.stageId === triggerConfig?.stageId;

    case 'CONTACT_CREATED':
      return true;

    case 'FIELD_UPDATED':
      return metadata?.field === triggerConfig?.field;

    case 'DATE_BASED':
      // Handled by cron, skip here
      return false;

    default:
      return false;
  }
}

// ─── Enrollment Processing ───────────────────────────────────────────────────

/**
 * Processes all active enrollments whose nextActionAt has passed.
 * Executes the current step, advances to the next, and logs results.
 */
export async function processEnrollments(): Promise<{ processed: number }> {
  const now = new Date();

  // Fetch candidates and immediately claim them by pushing nextActionAt into the future.
  // This prevents duplicate processing if the cron fires again before we finish.
  const candidates = await prisma.automationEnrollment.findMany({
    where: {
      status: 'ACTIVE',
      nextActionAt: { lte: now },
    },
    select: { id: true },
  });

  if (candidates.length === 0) return { processed: 0 };

  // Atomic claim: set nextActionAt to 5 min in the future so no other cycle picks them up
  const claimUntil = new Date(now.getTime() + 5 * 60 * 1000);
  await prisma.automationEnrollment.updateMany({
    where: { id: { in: candidates.map((c) => c.id) }, status: 'ACTIVE', nextActionAt: { lte: now } },
    data: { nextActionAt: claimUntil },
  });

  // Now fetch full data for claimed enrollments
  const enrollments = await prisma.automationEnrollment.findMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    include: {
      currentStep: true,
      automation: {
        include: {
          steps: {
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  });

  let processed = 0;
  let whatsappSentThisCycle = 0;

  for (const enrollment of enrollments) {
    try {
      const step = enrollment.currentStep;
      if (!step) {
        // No current step — mark as completed
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        processed++;
        continue;
      }

      // Safety guard: skip if deal is closed (LOST/WON)
      if (enrollment.contactId) {
        const openDeal = await prisma.deal.findFirst({
          where: { contactId: enrollment.contactId, status: 'OPEN' },
          select: { id: true, stageId: true },
        });
        if (!openDeal) {
          console.log(`[AutomationEngine] Enrollment ${enrollment.id} skipped — no open deals for contact ${enrollment.contactId}`);
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'COMPLETED', completedAt: new Date() },
          });
          processed++;
          continue;
        }

        // Safety net: if automation targets a specific stage and the deal is no longer
        // in that stage, auto-complete to prevent executing actions for the wrong stage.
        const triggerStageId = (enrollment.automation.triggerConfig as any)?.stageId;
        if (triggerStageId && openDeal.stageId !== triggerStageId) {
          console.log(`[AutomationEngine] Enrollment ${enrollment.id} auto-completed — stage mismatch (expected ${triggerStageId}, current ${openDeal.stageId})`);
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              metadata: {
                ...((enrollment.metadata as Record<string, unknown>) || {}),
                completedReason: 'stage_mismatch',
                expectedStageId: triggerStageId,
                actualStageId: openDeal.stageId,
              },
            },
          });
          processed++;
          continue;
        }
      }

      // ── WAIT_FOR_RESPONSE branching ──────────────────────────────────────
      // When the enrollment arrives at a WAIT_FOR_RESPONSE step and
      // nextActionAt <= now, it means either the client responded early
      // or the timeout has expired. Check metadata to decide the branch.
      if (step.actionType === 'WAIT_FOR_RESPONSE') {
        const meta = (enrollment.metadata as any) || {};
        const config = step.config as any;
        const waitHours = config?.waitHours || 24;
        const channel = config?.channel || 'any';

        let nextStepId: string | null = null;

        if (meta.responseReceived === true) {
          // Client responded before the timeout
          console.log(`[AutomationEngine] Cliente respondeu dentro do prazo — seguindo caminho 'respondeu'`);
          nextStepId = step.falseStepId; // "respondeu" path
        } else {
          // Timeout expired without response
          console.log(`[AutomationEngine] Sem resposta após ${waitHours}h — seguindo caminho 'não respondeu'`);
          nextStepId = step.trueStepId; // "não respondeu" path
        }

        // Log the WAIT_FOR_RESPONSE resolution
        await prisma.automationLog.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: step.id,
            actionType: step.actionType,
            result: {
              success: true,
              output: {
                responseReceived: meta.responseReceived === true,
                channel,
                waitHours,
                branchTaken: meta.responseReceived === true ? 'respondeu (falseStepId)' : 'não respondeu (trueStepId)',
              },
            },
          },
        });

        if (nextStepId) {
          // Advance to the chosen branch and clear awaiting metadata
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: {
              currentStepId: nextStepId,
              nextActionAt: new Date(),
              metadata: {
                ...(typeof meta === 'object' ? meta : {}),
                awaitingResponse: false,
                responseReceived: undefined,
                awaitingSince: undefined,
              },
            },
          });
        } else {
          // No branch target — complete the enrollment
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              currentStepId: null,
              nextActionAt: null,
              metadata: {
                ...(typeof meta === 'object' ? meta : {}),
                awaitingResponse: false,
              },
            },
          });
        }

        processed++;
        continue;
      }

      // Cadence automations: check feature flag + business hours for WhatsApp
      const isCadence = (enrollment.automation.triggerConfig as any)?.isCadence === true;
      const isWhatsAppAction = step.actionType === 'SEND_WHATSAPP' || step.actionType === 'SEND_WHATSAPP_AI' || step.actionType === 'SEND_WA_TEMPLATE';

      // Determine if this is a WABA automation (has SEND_WA_TEMPLATE steps)
      const isWabaAutomation = enrollment.automation.steps.some(
        (s) => s.actionType === 'SEND_WA_TEMPLATE'
      );

      // PROTEÇÃO ANTI-BAN: bloqueia QUALQUER envio WhatsApp (cadência ou não)
      // quando o contato está em atendimento humano. Checa as DUAS tabelas —
      // WaConversation (WABA, novo) e WhatsAppConversation (Z-API, antigo) —
      // porque a UI atualiza WaConversation mas automações legadas podem ler
      // WhatsAppConversation.
      if (isWhatsAppAction && enrollment.contactId) {
        const [waConv, zapConv] = await Promise.all([
          prisma.waConversation.findFirst({
            where: { contactId: enrollment.contactId },
            select: { needsHumanAttention: true },
          }),
          prisma.whatsAppConversation.findFirst({
            where: { contactId: enrollment.contactId },
            select: { needsHumanAttention: true },
          }),
        ]);
        if (waConv?.needsHumanAttention || zapConv?.needsHumanAttention) {
          console.log(`[AutomationEngine] Envio WhatsApp bloqueado — atendimento humano ativo (enrollment ${enrollment.id})`);
          // Pausa o enrollment para não reprocessar em loop
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: { status: 'PAUSED' },
          }).catch(() => {});
          continue;
        }
      }

      if (isCadence) {
        // WABA cadences always run. Z-API cadences need cadenceEnabled flag.
        if (!isWabaAutomation) {
          const waConfig = await prisma.whatsAppConfig.findFirst({ select: { cadenceEnabled: true } });
          if (!waConfig?.cadenceEnabled) {
            continue;
          }
        }

        // WhatsApp actions respect business hours; emails don't
        if (isWhatsAppAction) {
          const { isBusinessHours, msUntilNextBusinessHour } = await import('../utils/sendingWindow');
          if (!isBusinessHours()) {
            // Exceção: primeiro template WABA da cadência pode sair fora do horário.
            // Lead acabou de entrar (ex: meia-noite) e o primeiro contato deve ser imediato.
            // Identificamos como "primeiro" se não existe nenhum log de envio WhatsApp
            // bem-sucedido para esse enrollment.
            let isFirstWaTemplate = false;
            if (step.actionType === 'SEND_WA_TEMPLATE') {
              const previousWaSend = await prisma.automationLog.findFirst({
                where: {
                  enrollmentId: enrollment.id,
                  actionType: { in: ['SEND_WA_TEMPLATE', 'SEND_WHATSAPP', 'SEND_WHATSAPP_AI'] },
                },
                select: { id: true },
              });
              isFirstWaTemplate = !previousWaSend;
            }

            if (isFirstWaTemplate) {
              console.log(`[AutomationEngine] Primeiro template WABA da cadência — enviando fora do horário (enrollment ${enrollment.id})`);
              // Segue para envio imediato, sem reagendar
            } else {
              // Follow-ups respeitam horário comercial
              // Schedule for next business hour + random jitter (0-120 min)
              // to SPREAD messages throughout the day instead of bursting at 8am
              const msUntil = msUntilNextBusinessHour();
              const jitterMs = Math.floor(Math.random() * 120 * 60 * 1000); // 0-2 hours
              const nextBH = new Date(Date.now() + msUntil + jitterMs);
              await prisma.automationEnrollment.update({
                where: { id: enrollment.id },
                data: { nextActionAt: nextBH },
              });
              console.log(`[AutomationEngine] Cadência WhatsApp fora do horário — reagendado para ${nextBH.toISOString()} com jitter +${Math.round(jitterMs / 60000)}min (enrollment ${enrollment.id})`);
              continue;
            }
          }
        }
      }

      // ── WhatsApp throttle: per-cycle cap + delay entre envios ───────────
      // O limite diário por fonte é verificado dentro de cada action individualmente,
      // pois só lá é conhecido o tipo (followUp, sdrFirstContact, etc.).
      // Aqui mantemos apenas o throttle de velocidade, que é a proteção real anti-ban.
      if (isWhatsAppAction) {
        // Per-cycle cap: stagger remaining WhatsApp sends with random delay
        if (whatsappSentThisCycle >= WHATSAPP_MAX_PER_CYCLE) {
          const delaySec = WHATSAPP_MIN_DELAY_S + Math.random() * (WHATSAPP_MAX_DELAY_S - WHATSAPP_MIN_DELAY_S);
          const staggeredAt = new Date(Date.now() + delaySec * 1000);
          await prisma.automationEnrollment.update({
            where: { id: enrollment.id },
            data: { nextActionAt: staggeredAt },
          });
          console.log(`[AutomationEngine] Throttle: máx ${WHATSAPP_MAX_PER_CYCLE} WhatsApp/ciclo — reagendado em ${Math.round(delaySec)}s (enrollment ${enrollment.id})`);
          continue;
        }

        // Add random delay between sends within the cycle (sleep before sending)
        if (whatsappSentThisCycle > 0) {
          const delaySec = WHATSAPP_MIN_DELAY_S + Math.random() * (WHATSAPP_MAX_DELAY_S - WHATSAPP_MIN_DELAY_S);
          console.log(`[AutomationEngine] Throttle: aguardando ${Math.round(delaySec)}s antes do próximo WhatsApp...`);
          await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
        }
      }

      // Execute the action
      const result = await executeAction(enrollment, step, {
        generalContext: (enrollment.automation.triggerConfig as any)?.generalContext || '',
      });

      // Se a action pede retry (ex: template PENDING), não avança — tenta de novo no próximo ciclo
      if (result.retry) {
        const retryAt = new Date(Date.now() + 5 * 60 * 1000); // tenta de novo em 5 min
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: { nextActionAt: retryAt },
        });
        console.log(`[AutomationEngine] Retry solicitado — reagendado pra ${retryAt.toISOString()} (enrollment ${enrollment.id}): ${result.output}`);
        processed++;
        continue;
      }

      // Track WhatsApp sends for per-cycle throttle (volume is registered inside the actions themselves)
      if (isWhatsAppAction && result.success) {
        whatsappSentThisCycle++;
        console.log(`[AutomationEngine] WhatsApp enviado (${whatsappSentThisCycle}/${WHATSAPP_MAX_PER_CYCLE} neste ciclo) — enrollment ${enrollment.id}`);
      }

      // Create log entry
      await prisma.automationLog.create({
        data: {
          enrollmentId: enrollment.id,
          stepId: step.id,
          actionType: step.actionType,
          result: result as any,
        },
      });

      // Determine the next step
      let nextStepId: string | null = null;

      if (step.actionType === 'CONDITION') {
        nextStepId = result.conditionResult ? step.trueStepId : step.falseStepId;
      } else if (step.nextStepId) {
        nextStepId = step.nextStepId;
      } else {
        // Try to find the next step by order
        const currentOrder = step.order;
        const nextStep = enrollment.automation.steps.find(
          (s) => s.order === currentOrder + 1
        );
        nextStepId = nextStep?.id ?? null;
      }

      if (nextStepId) {
        // Advance to next step
        // Use nextActionAt from the action result (e.g. WAIT sets a future date),
        // otherwise default to "now" so the next step runs immediately.
        const updateData: Record<string, unknown> = {
          currentStepId: nextStepId,
          nextActionAt: result.nextActionAt ?? new Date(),
        };

        // If the NEXT step is WAIT_FOR_RESPONSE, pre-set awaitingResponse metadata
        // so checkAndCancelWaitForResponse can detect it when the lead responds
        const nextStep = enrollment.automation.steps.find(s => s.id === nextStepId);
        if (nextStep?.actionType === 'WAIT_FOR_RESPONSE') {
          const waitConfig = nextStep.config as Record<string, unknown>;
          updateData.metadata = {
            ...((enrollment.metadata as Record<string, unknown>) || {}),
            awaitingResponse: true,
            awaitingSince: new Date().toISOString(),
            channel: waitConfig?.channel || 'any',
            responseReceived: false,
          };
        }

        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: updateData,
        });
      } else {
        // No next step — enrollment is completed
        await prisma.automationEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            currentStepId: null,
            nextActionAt: null,
          },
        });

        // Auto-close deal as LOST when a cadence completes all steps without conversion.
        // If the lead had responded/advanced, the cadence would have been cancelled by
        // stage change — reaching the end means all follow-up attempts were exhausted.
        const isCadence = (enrollment.automation.triggerConfig as any)?.isCadence === true;
        if (isCadence && enrollment.contactId) {
          const openDeal = await prisma.deal.findFirst({
            where: { contactId: enrollment.contactId, status: 'OPEN' },
            select: { id: true, stageId: true },
          });
          if (openDeal) {
            // Guard: don't auto-close if the lead has an active scheduled meeting
            const hasActiveMeeting = await prisma.calendlyEvent.findFirst({
              where: { contactId: enrollment.contactId, status: 'active' },
              select: { id: true },
            });
            if (hasActiveMeeting) {
              console.log(`[AutomationEngine] Deal ${openDeal.id} has active meeting — skipping auto-close for cadence "${enrollment.automation.name}"`);
            } else {
              const LOST_REASON_NUNCA_RESPONDEU = '64fb7515ea4eb400219457cb';
              const LOST_REASON_PAROU_RETORNO = '67cf41a6f638130017ff61ec';
              const SYSTEM_USER_ID = '652d44fd439afa0017e1044b'; // BGP CRM

              // Check if lead ever responded (has any inbound WA message)
              const hasInbound = await prisma.waMessage.findFirst({
                where: {
                  conversation: { contactId: enrollment.contactId },
                  direction: 'INBOUND',
                },
                select: { id: true },
              });
              // Also check Z-API conversations
              const hasZapiInbound = !hasInbound ? await prisma.whatsAppMessage.findFirst({
                where: {
                  conversation: { contactId: enrollment.contactId },
                  sender: 'CLIENT',
                },
                select: { id: true },
              }).catch(() => null) : null;

              const everResponded = !!(hasInbound || hasZapiInbound);
              const lostReasonId = everResponded ? LOST_REASON_PAROU_RETORNO : LOST_REASON_NUNCA_RESPONDEU;
              const reason = everResponded ? 'Parou de dar retorno' : 'Nunca respondeu';

              // Transaction: deal update + activity must succeed together
              await prisma.$transaction([
                prisma.deal.update({
                  where: { id: openDeal.id },
                  data: {
                    status: 'LOST',
                    lostReasonId,
                    closedAt: new Date(),
                  },
                }),
                prisma.activity.create({
                  data: {
                    type: 'STATUS_CHANGE',
                    content: `Negociação encerrada automaticamente — cadência "${enrollment.automation.name}" completou todas as etapas sem conversão. Motivo: ${reason}`,
                    contactId: enrollment.contactId,
                    dealId: openDeal.id,
                    userId: SYSTEM_USER_ID,
                  },
                }),
              ]);

              console.log(`[AutomationEngine] Deal ${openDeal.id} auto-closed as LOST (${everResponded ? 'parou retorno' : 'nunca respondeu'}) — cadence "${enrollment.automation.name}" exhausted`);
            }
          }
        }
      }

      processed++;
    } catch (error) {
      console.error(
        `[AutomationEngine] Error processing enrollment ${enrollment.id}:`,
        error
      );

      // Log the failure but don't stop processing other enrollments
      if (enrollment.currentStep) {
        await prisma.automationLog.create({
          data: {
            enrollmentId: enrollment.id,
            stepId: enrollment.currentStep.id,
            actionType: enrollment.currentStep.actionType,
            result: {
              success: false,
              output: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
      }

      // Mark as FAILED so it doesn't get retried endlessly
      await prisma.automationEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'FAILED' },
      });

      processed++;
    }
  }

  if (whatsappSentThisCycle > 0) {
    console.log(`[AutomationEngine] Ciclo concluído: ${whatsappSentThisCycle} WhatsApp enviados, ${processed} enrollments processados`);
  }

  return { processed };
}
