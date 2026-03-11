import prisma from '../lib/prisma';

export async function dispatchWebhook(eventName: string, payload: unknown): Promise<void> {
  let configs: {
    id: string;
    url: string;
    secret: string | null;
    headers: unknown;
    events: unknown;
  }[];

  try {
    configs = await prisma.webhookConfig.findMany({
      where: {
        type: 'OUTGOING',
        isActive: true,
      },
      select: {
        id: true,
        url: true,
        secret: true,
        headers: true,
        events: true,
      },
    });
  } catch (err) {
    console.error('[webhookDispatcher] Failed to fetch webhook configs:', err);
    return;
  }

  // Filter configs that listen to this event
  const matching = configs.filter((cfg) => {
    const events = cfg.events;
    if (Array.isArray(events)) {
      return events.includes(eventName);
    }
    return false;
  });

  if (matching.length === 0) return;

  const requests = matching.map(async (cfg) => {
    const extraHeaders: Record<string, string> =
      cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)
        ? (cfg.headers as Record<string, string>)
        : {};

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    if (cfg.secret) {
      headers['X-Webhook-Secret'] = cfg.secret;
    }

    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ event: eventName, payload }),
      });

      if (!res.ok) {
        console.error(
          `[webhookDispatcher] Outgoing webhook ${cfg.id} responded with ${res.status} for event "${eventName}"`
        );
      }
    } catch (err) {
      console.error(
        `[webhookDispatcher] Failed to dispatch outgoing webhook ${cfg.id} for event "${eventName}":`,
        err
      );
    }
  });

  // Fire-and-forget — do not block the caller
  Promise.allSettled(requests).catch((err) => {
    console.error('[webhookDispatcher] Unexpected error in Promise.allSettled:', err);
  });
}
