/**
 * Tests for Calendly webhook contact matching logic.
 *
 * Reproduces the bug where two leads with similar first names ("Flavio Mattos"
 * and "Flavio KMS") entered ~15min apart and the system mixed up their deals
 * because the old code used fuzzy name matching + time proximity.
 *
 * After the fix, matching uses: email (exact) > phone > exact unique name.
 * Fuzzy name matching and "recent LP lead" guessing were removed entirely.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock prisma
// ---------------------------------------------------------------------------
const mockPrisma = {
  calendlyConfig: { findFirst: vi.fn() },
  calendlyEvent: {
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  contact: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  deal: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  pipeline: { findFirst: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
  user: { findFirst: vi.fn() },
  source: { findFirst: vi.fn(), create: vi.fn() },
  activity: { create: vi.fn() },
  task: { create: vi.fn(), updateMany: vi.fn() },
  tag: { findUnique: vi.fn() },
  contactTag: { upsert: vi.fn() },
  whatsAppConversation: { findFirst: vi.fn() },
};

vi.mock('../lib/prisma', () => ({ default: mockPrisma, prisma: mockPrisma }));
vi.mock('../services/meetingReminderScheduler', () => ({
  scheduleMeetingReminders: vi.fn().mockResolvedValue(undefined),
  cancelMeetingReminders: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal Calendly invitee.created webhook body */
function buildCalendlyPayload(overrides: {
  email: string;
  name: string;
  uri?: string;
  startTime?: string;
}) {
  return {
    event: 'invitee.created',
    payload: {
      email: overrides.email,
      name: overrides.name,
      uri: overrides.uri || `https://calendly.com/invitees/${Math.random().toString(36).slice(2)}`,
      timezone: 'America/Sao_Paulo',
      questions_and_answers: [],
      scheduled_event: {
        uri: `https://calendly.com/events/${Math.random().toString(36).slice(2)}`,
        name: 'Diagnostico Financeiro',
        start_time: overrides.startTime || '2026-04-01T14:00:00Z',
        end_time: '2026-04-01T15:00:00Z',
        event_memberships: [{ user_email: 'closer@bgpgo.com', user_name: 'Closer' }],
      },
    },
  };
}

// A fake Express req/res pair
function createMockReqRes(body: Record<string, unknown>) {
  const req = {
    body,
    headers: {},
    ip: '127.0.0.1',
  } as unknown as import('express').Request;

  const resData: { statusCode: number; json: unknown } = { statusCode: 200, json: null };
  const res = {
    status(code: number) {
      resData.statusCode = code;
      return res;
    },
    json(data: unknown) {
      resData.json = data;
      return res;
    },
  } as unknown as import('express').Response;

  return { req, res, resData };
}

// ---------------------------------------------------------------------------
// We need to import the route handler. Since it's an Express Router, we'll
// extract the POST handler by importing the module and inspecting the router stack.
// ---------------------------------------------------------------------------

// Dynamically import after mocks are set up
async function getHandler() {
  const mod = await import('../routes/calendly-webhook');
  const router = mod.default;
  // Express router stores handlers in router.stack
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routerAny = router as any;
  const layer = routerAny.stack.find(
    (l: any) => l.route?.methods?.post && l.route?.path === '/'
  );
  if (!layer?.route) throw new Error('POST / handler not found on calendly-webhook router');
  // The actual handler is the last function in the route stack
  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 1].handle as (req: import('express').Request, res: import('express').Response) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Calendly webhook — contact matching', () => {
  let handler: (req: import('express').Request, res: import('express').Response) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: no webhook secret configured
    mockPrisma.calendlyConfig.findFirst.mockResolvedValue(null);

    // Default CalendlyEvent upsert returns a fake event
    mockPrisma.calendlyEvent.upsert.mockResolvedValue({ id: 'evt-1' });
    mockPrisma.calendlyEvent.update.mockResolvedValue({});

    // Tags / WhatsApp not relevant — return null
    mockPrisma.tag.findUnique.mockResolvedValue(null);
    mockPrisma.whatsAppConversation.findFirst.mockResolvedValue(null);

    // Activity / task creation
    mockPrisma.activity.create.mockResolvedValue({});
    mockPrisma.task.create.mockResolvedValue({});

    handler = await getHandler();
  });

  it('matches contact by email even when multiple leads share the same first name', async () => {
    // Two contacts with similar names but different emails
    const contactFlavio1 = {
      id: 'contact-flavio-mattos',
      name: 'Flavio Mattos',
      email: 'flavio.mattos@clorup.com.br',
      phone: null,
      createdAt: new Date(Date.now() - 5 * 60 * 1000),
    };
    const contactFlavio2 = {
      id: 'contact-flavio-kms',
      name: 'Flavio KMS',
      email: 'flaviokms@gmail.com',
      phone: null,
      createdAt: new Date(Date.now() - 2 * 60 * 1000),
    };

    // Webhook comes in for Flavio Mattos with his exact email
    const body = buildCalendlyPayload({
      email: 'flavio.mattos@clorup.com.br',
      name: 'Flavio Mattos',
    });

    // Email lookup returns the correct contact
    mockPrisma.contact.findFirst.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      const where = args?.where;
      if (where?.email) {
        const emailFilter = where.email as { equals?: string };
        if (emailFilter.equals === 'flavio.mattos@clorup.com.br') return contactFlavio1;
        if (emailFilter.equals === 'flaviokms@gmail.com') return contactFlavio2;
      }
      return null;
    });

    // Deal for Flavio 1
    const dealFlavio1 = {
      id: 'deal-flavio-mattos',
      contactId: 'contact-flavio-mattos',
      status: 'OPEN',
      pipelineId: 'pipeline-1',
      userId: 'user-1',
      stage: { id: 'stage-3', name: 'Marcar reunião', order: 3 },
    };

    mockPrisma.deal.findFirst.mockResolvedValue(dealFlavio1);
    mockPrisma.deal.update.mockResolvedValue({});

    // Pipeline stages
    mockPrisma.pipelineStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Lead', order: 1 },
      { id: 'stage-2', name: 'Contato Feito', order: 2 },
      { id: 'stage-3', name: 'Marcar reunião', order: 3 },
      { id: 'stage-4', name: 'Reunião agendada', order: 4 },
      { id: 'stage-5', name: 'Proposta Enviada', order: 5 },
    ]);

    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-closer', name: 'Closer' });

    const { req, res, resData } = createMockReqRes(body);
    await handler(req, res);

    expect(resData.statusCode).toBe(200);

    // The deal update should move Flavio MATTOS's deal (not Flavio KMS's)
    const dealUpdateCall = mockPrisma.deal.update.mock.calls[0];
    expect(dealUpdateCall).toBeDefined();
    expect(dealUpdateCall[0].where.id).toBe('deal-flavio-mattos');
    expect(dealUpdateCall[0].data.stageId).toBe('stage-4'); // Reuniao agendada

    // CalendlyEvent should link to the correct contact
    const eventUpdateCalls = mockPrisma.calendlyEvent.update.mock.calls;
    const contactLinkCall = eventUpdateCalls.find(
      (c: Array<{ data?: { contactId?: string } }>) => c[0]?.data?.contactId
    );
    expect(contactLinkCall).toBeDefined();
    expect(contactLinkCall![0].data.contactId).toBe('contact-flavio-mattos');
  });

  it('refuses to match by name when multiple contacts share the same name', async () => {
    // Two contacts with IDENTICAL names but different emails
    const contactA = {
      id: 'contact-a',
      name: 'Flavio Mattos',
      email: 'flavio-a@example.com',
      phone: null,
    };
    const contactB = {
      id: 'contact-b',
      name: 'Flavio Mattos',
      email: 'flavio-b@example.com',
      phone: null,
    };

    // Webhook has an email NOT matching any contact — forces name fallback
    const body = buildCalendlyPayload({
      email: 'flavio-new@different.com',
      name: 'Flavio Mattos',
    });

    // Email lookup returns nothing
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    // Name lookup returns 2 matches (ambiguous)
    mockPrisma.contact.findMany.mockResolvedValue([contactA, contactB]);

    // Auto-create contact since no match
    const newContact = {
      id: 'contact-new',
      name: 'Flavio Mattos',
      email: 'flavio-new@different.com',
      phone: null,
    };
    mockPrisma.contact.create.mockResolvedValue(newContact);

    // No existing deal
    mockPrisma.deal.findFirst.mockResolvedValue(null);

    // Pipeline for auto-create
    mockPrisma.pipeline.findFirst.mockResolvedValue({
      id: 'pipeline-1',
      isDefault: true,
      stages: [
        { id: 'stage-1', name: 'Lead', order: 1 },
        { id: 'stage-4', name: 'Reunião agendada', order: 4 },
      ],
    });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Admin' });
    mockPrisma.source.findFirst.mockResolvedValue({ id: 'source-calendly', name: 'Calendly' });
    mockPrisma.deal.create.mockResolvedValue({
      id: 'deal-new',
      contactId: 'contact-new',
      status: 'OPEN',
      pipelineId: 'pipeline-1',
      userId: 'user-1',
      stage: { id: 'stage-4', name: 'Reunião agendada', order: 4 },
    });
    mockPrisma.pipelineStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Lead', order: 1 },
      { id: 'stage-4', name: 'Reunião agendada', order: 4 },
    ]);

    const { req, res, resData } = createMockReqRes(body);
    await handler(req, res);

    expect(resData.statusCode).toBe(200);

    // Should NOT have matched contactA or contactB
    // Instead, should have auto-created a new contact
    expect(mockPrisma.contact.create).toHaveBeenCalledWith({
      data: {
        name: 'Flavio Mattos',
        email: 'flavio-new@different.com',
        phone: null,
      },
    });

    // CalendlyEvent should link to the NEW contact, not an old one
    const eventUpdateCalls = mockPrisma.calendlyEvent.update.mock.calls;
    const contactLinkCall = eventUpdateCalls.find(
      (c: Array<{ data?: { contactId?: string } }>) => c[0]?.data?.contactId
    );
    expect(contactLinkCall![0].data.contactId).toBe('contact-new');
  });

  it('two leads with same first name in sequence — each gets their own deal', async () => {
    // Simulates the original bug scenario:
    // Lead 1: "Flavio Mattos" (flavio.mattos@clorup.com.br) enters via LP, webhook fires
    // Lead 2: "Flavio KMS" (flaviokms@gmail.com) enters via Calendly 15 min later
    // Before fix: fuzzy match would link Lead 2 to Lead 1's contact
    // After fix: email-based match means Lead 2 gets its own contact/deal

    const body = buildCalendlyPayload({
      email: 'flaviokms@gmail.com',
      name: 'Flavio KMS',
    });

    // "Flavio Mattos" exists in DB from LP entry, but email is different
    const contactFlavio1 = {
      id: 'contact-flavio-mattos',
      name: 'Flavio Mattos',
      email: 'flavio.mattos@clorup.com.br',
      phone: null,
      createdAt: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago
    };

    // Email lookup: "flaviokms@gmail.com" doesn't match any existing contact
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    // Name lookup: "Flavio KMS" doesn't match "Flavio Mattos" exactly
    mockPrisma.contact.findMany.mockResolvedValue([]);

    // Auto-create
    const newContact = {
      id: 'contact-flavio-kms',
      name: 'Flavio KMS',
      email: 'flaviokms@gmail.com',
      phone: null,
    };
    mockPrisma.contact.create.mockResolvedValue(newContact);

    // No existing deal for this new contact
    mockPrisma.deal.findFirst.mockResolvedValue(null);

    mockPrisma.pipeline.findFirst.mockResolvedValue({
      id: 'pipeline-1',
      isDefault: true,
      stages: [
        { id: 'stage-1', name: 'Lead', order: 1 },
        { id: 'stage-4', name: 'Reunião agendada', order: 4 },
      ],
    });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1', name: 'Admin' });
    mockPrisma.source.findFirst.mockResolvedValue({ id: 'source-calendly', name: 'Calendly' });
    mockPrisma.deal.create.mockResolvedValue({
      id: 'deal-flavio-kms',
      contactId: 'contact-flavio-kms',
      status: 'OPEN',
      pipelineId: 'pipeline-1',
      userId: 'user-1',
      stage: { id: 'stage-4', name: 'Reunião agendada', order: 4 },
    });
    mockPrisma.pipelineStage.findMany.mockResolvedValue([
      { id: 'stage-1', name: 'Lead', order: 1 },
      { id: 'stage-4', name: 'Reunião agendada', order: 4 },
    ]);

    const { req, res, resData } = createMockReqRes(body);
    await handler(req, res);

    expect(resData.statusCode).toBe(200);

    // Must create a NEW contact for Flavio KMS — not reuse Flavio Mattos
    expect(mockPrisma.contact.create).toHaveBeenCalledWith({
      data: {
        name: 'Flavio KMS',
        email: 'flaviokms@gmail.com',
        phone: null,
      },
    });

    // CalendlyEvent must link to the new contact
    const eventUpdateCalls = mockPrisma.calendlyEvent.update.mock.calls;
    const contactLinkCall = eventUpdateCalls.find(
      (c: Array<{ data?: { contactId?: string } }>) => c[0]?.data?.contactId
    );
    expect(contactLinkCall![0].data.contactId).toBe('contact-flavio-kms');

    // Deal must be created for the new contact, not reusing Flavio Mattos's deal
    expect(mockPrisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-flavio-kms',
        }),
        include: { stage: true },
      })
    );
  });
});
