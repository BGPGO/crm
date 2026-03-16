import prisma from '../lib/prisma';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CalendlyAvailableTime {
  status: string;
  start_time: string;
  invitees_remaining: number;
}

interface CalendlyAvailableTimesResponse {
  collection: CalendlyAvailableTime[];
}

interface CalendlyEventType {
  uri: string;
  slug: string;
  name: string;
}

interface CalendlyEventTypesResponse {
  collection: CalendlyEventType[];
}

// ─── Cache ──────────────────────────────────────────────────────────────────

let cachedSlots: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSlotsForBot(times: CalendlyAvailableTime[]): string {
  if (!times.length) {
    return 'Horários disponíveis de segunda a sexta, 9h às 17h (última reunião 16:15).';
  }

  // Group by day
  const byDay: Record<string, string[]> = {};
  const dayNames: Record<string, string> = {};

  for (const slot of times) {
    const dt = new Date(slot.start_time);
    const brDate = new Date(dt.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const dateKey = brDate.toLocaleDateString('pt-BR');

    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    dayNames[dateKey] = dias[brDate.getDay()];

    if (!byDay[dateKey]) byDay[dateKey] = [];
    const hour = brDate.getHours();
    const min = brDate.getMinutes().toString().padStart(2, '0');
    byDay[dateKey].push(`${hour}:${min}`);
  }

  const parts: string[] = [];
  for (const [date, slots] of Object.entries(byDay)) {
    const dayName = dayNames[date];
    parts.push(`${dayName} (${date}): ${slots.join(', ')}`);
  }

  return `Próximos horários disponíveis no Calendly: ${parts.join(' | ')}`;
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Fetches the next available slots from Calendly API.
 * Results are cached for 5 minutes to avoid excessive API calls.
 *
 * @param days - Number of days ahead to check (default: 3)
 * @returns Formatted string with available slots for the bot context
 */
export async function getNextAvailableSlots(days: number = 3): Promise<string> {
  // Check cache
  const now = Date.now();
  if (cachedSlots !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSlots;
  }

  const fallback = 'Horários disponíveis de segunda a sexta, 9h às 17h (última reunião 16:15).';

  try {
    const config = await prisma.calendlyConfig.findFirst({ where: { isActive: true } });
    if (!config?.apiKey || !config?.organizationUri) {
      cachedSlots = fallback;
      cacheTimestamp = now;
      return fallback;
    }

    const apiKey = config.apiKey;
    const orgUri = config.organizationUri;

    // Step 1: Get event types to find the correct event_type URI
    const eventTypesRes = await fetch(
      `https://api.calendly.com/event_types?organization=${encodeURIComponent(orgUri)}&active=true`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!eventTypesRes.ok) {
      console.warn(`[Calendly] Failed to fetch event types: ${eventTypesRes.status}`);
      cachedSlots = fallback;
      cacheTimestamp = now;
      return fallback;
    }

    const eventTypesData = (await eventTypesRes.json()) as CalendlyEventTypesResponse;
    // Look for the "30min" slug or first available event type
    const eventType =
      eventTypesData.collection.find((et) => et.slug === '30min') ||
      eventTypesData.collection[0];

    if (!eventType) {
      cachedSlots = fallback;
      cacheTimestamp = now;
      return fallback;
    }

    // Step 2: Get available times
    const startTime = new Date().toISOString();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    const endTime = endDate.toISOString();

    const availRes = await fetch(
      `https://api.calendly.com/event_type_available_times?event_type=${encodeURIComponent(eventType.uri)}&start_time=${startTime}&end_time=${endTime}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!availRes.ok) {
      console.warn(`[Calendly] Failed to fetch available times: ${availRes.status}`);
      cachedSlots = fallback;
      cacheTimestamp = now;
      return fallback;
    }

    const availData = (await availRes.json()) as CalendlyAvailableTimesResponse;
    const result = formatSlotsForBot(availData.collection);

    cachedSlots = result;
    cacheTimestamp = now;
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Calendly] Error fetching availability:`, message);
    cachedSlots = fallback;
    cacheTimestamp = now;
    return fallback;
  }
}

/**
 * Clears the cached slots (useful for testing or forcing a refresh).
 */
export function clearAvailabilityCache(): void {
  cachedSlots = null;
  cacheTimestamp = 0;
}
