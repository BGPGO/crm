import type { Brand } from '@prisma/client';

export interface SegmentFilter {
  field: string;
  operator: string;
  value: any;
}

/**
 * A group of filters combined with AND.
 * Multiple FilterGroups are combined with OR between them.
 */
export interface FilterGroup {
  filters: SegmentFilter[];
}

// ── All valid segment fields, grouped by category ─────────────────────────────

const VALID_SEGMENT_FIELDS = new Set([
  // Contact direct fields
  'name', 'email', 'phone', 'position', 'sector', 'notes', 'birthday', 'instagram',
  'createdAt', 'updatedAt',
  // Organization (via relation)
  'organizationId', 'organizationName', 'organizationSegment', 'organizationCnpj',
  // Tags
  'tags',
  // Lead Score / Engagement
  'engagementLevel', 'score', 'lastEmailOpenedAt', 'lastEmailClickedAt',
  // Deal-related (via contact → deals)
  'dealStatus', 'dealStageId', 'dealStageName', 'dealValue', 'dealSourceId',
  'dealLostReasonId', 'dealProductId', 'dealProductName', 'dealUserId',
  'dealCreatedAt', 'dealClosedAt', 'dealCampaignId',
  // Has/doesn't have deal
  'hasDeal', 'hasOpenDeal', 'hasWonDeal', 'hasLostDeal',
  // Email engagement
  'emailOpened', 'emailClicked', 'emailBounced', 'emailUnsubscribed',
  'emailSendCount',
  // UTM / Lead Tracking
  'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'landingPage', 'referrer',
  // WhatsApp
  'hasWhatsAppConversation', 'whatsAppOptedOut', 'whatsAppStatus',
  // Relative dates
  'createdDaysAgo', 'lastActivityDaysAgo',
  // Automation
  'inAutomation',
  // Calendly/Meetings
  'hasMeeting',
]);

/**
 * Detects whether the input is an array of FilterGroups (new format)
 * or a flat array of SegmentFilters (old format).
 *
 * A FilterGroup has a `filters` array property.
 * A SegmentFilter has `field`, `operator`, `value` properties.
 */
function isFilterGroupArray(input: SegmentFilter[] | FilterGroup[]): input is FilterGroup[] {
  if (!Array.isArray(input) || input.length === 0) return false;
  const first = input[0] as any;
  return Array.isArray(first.filters);
}

/**
 * Builds a Prisma condition array from a flat list of SegmentFilters (AND logic).
 * Returns a raw array of conditions — callers wrap with AND/OR as needed.
 */
function buildConditions(filters: SegmentFilter[]): Record<string, any>[] {
  const conditions: Record<string, any>[] = [];

  for (const filter of filters) {
    const { field, operator, value } = filter;

    if (!VALID_SEGMENT_FIELDS.has(field)) {
      throw new Error(`Invalid segment field: "${field}"`);
    }

    // ── Tags ──────────────────────────────────────────────────────────
    if (field === 'tags') {
      const tagIds = Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
      conditions.push({ tags: { some: { tagId: { in: tagIds } } } });
      continue;
    }

    // ── Engagement / Score (via leadScore relation) ───────────────────
    if (field === 'engagementLevel') {
      conditions.push({ leadScore: { engagementLevel: mapOp(operator, value) } });
      continue;
    }
    if (field === 'score') {
      conditions.push({ leadScore: { score: mapOp(operator, coerceNumber(value)) } });
      continue;
    }
    if (field === 'lastEmailOpenedAt') {
      conditions.push({ leadScore: { lastEmailOpenedAt: mapOp(operator, coerceDate(value)) } });
      continue;
    }
    if (field === 'lastEmailClickedAt') {
      conditions.push({ leadScore: { lastEmailClickedAt: mapOp(operator, coerceDate(value)) } });
      continue;
    }

    // ── Organization (via relation) ───────────────────────────────────
    if (field === 'organizationId') {
      conditions.push({ organizationId: mapOp(operator, value) });
      continue;
    }
    if (field === 'organizationName') {
      conditions.push({ organization: { name: mapOp(operator, value) } });
      continue;
    }
    if (field === 'organizationSegment') {
      conditions.push({ organization: { segment: mapOp(operator, value) } });
      continue;
    }
    if (field === 'organizationCnpj') {
      if (operator === 'EXISTS') {
        conditions.push({ organization: { cnpj: value === 'true' ? { not: null } : null } });
      } else {
        conditions.push({ organization: { cnpj: mapOp(operator, value) } });
      }
      continue;
    }

    // ── Deal-related (via contact → deals) ────────────────────────────
    if (field === 'dealStatus') {
      conditions.push({ deals: { some: { status: mapOp(operator, value) } } });
      continue;
    }
    if (field === 'dealStageId') {
      conditions.push({ deals: { some: { stageId: mapOp(operator, value), status: 'OPEN' } } });
      continue;
    }
    if (field === 'dealStageName') {
      conditions.push({ deals: { some: { stage: { name: mapOp(operator, value) }, status: 'OPEN' } } });
      continue;
    }
    if (field === 'dealValue') {
      conditions.push({ deals: { some: { value: mapOp(operator, coerceNumber(value)) } } });
      continue;
    }
    if (field === 'dealSourceId') {
      conditions.push({ deals: { some: { sourceId: mapOp(operator, value) } } });
      continue;
    }
    if (field === 'dealLostReasonId') {
      conditions.push({ deals: { some: { lostReasonId: mapOp(operator, value), status: 'LOST' } } });
      continue;
    }
    if (field === 'dealProductId') {
      conditions.push({ deals: { some: { products: { some: { productId: mapOp(operator, value) } } } } });
      continue;
    }
    if (field === 'dealProductName') {
      conditions.push({ deals: { some: { products: { some: { product: { name: mapOp(operator, value) } } } } } });
      continue;
    }
    if (field === 'dealUserId') {
      conditions.push({ deals: { some: { userId: mapOp(operator, value) } } });
      continue;
    }
    if (field === 'dealCreatedAt') {
      conditions.push({ deals: { some: { createdAt: mapOp(operator, coerceDate(value)) } } });
      continue;
    }
    if (field === 'dealClosedAt') {
      conditions.push({ deals: { some: { closedAt: mapOp(operator, coerceDate(value)) } } });
      continue;
    }
    if (field === 'dealCampaignId') {
      conditions.push({ deals: { some: { campaignId: mapOp(operator, value) } } });
      continue;
    }

    // ── Has/doesn't have deal (boolean-like) ──────────────────────────
    if (field === 'hasDeal') {
      conditions.push(value === 'true' || value === true
        ? { deals: { some: {} } }
        : { deals: { none: {} } });
      continue;
    }
    if (field === 'hasOpenDeal') {
      conditions.push(value === 'true' || value === true
        ? { deals: { some: { status: 'OPEN' } } }
        : { NOT: { deals: { some: { status: 'OPEN' } } } });
      continue;
    }
    if (field === 'hasWonDeal') {
      conditions.push(value === 'true' || value === true
        ? { deals: { some: { status: 'WON' } } }
        : { NOT: { deals: { some: { status: 'WON' } } } });
      continue;
    }
    if (field === 'hasLostDeal') {
      conditions.push(value === 'true' || value === true
        ? { deals: { some: { status: 'LOST' } } }
        : { NOT: { deals: { some: { status: 'LOST' } } } });
      continue;
    }

    // ── Email engagement (via emailSends relation) ────────────────────
    if (field === 'emailOpened') {
      conditions.push(value === 'true' || value === true
        ? { emailSends: { some: { openedAt: { not: null } } } }
        : { NOT: { emailSends: { some: { openedAt: { not: null } } } } });
      continue;
    }
    if (field === 'emailClicked') {
      conditions.push(value === 'true' || value === true
        ? { emailSends: { some: { clickedAt: { not: null } } } }
        : { NOT: { emailSends: { some: { clickedAt: { not: null } } } } });
      continue;
    }
    if (field === 'emailBounced') {
      conditions.push(value === 'true' || value === true
        ? { emailSends: { some: { bouncedAt: { not: null } } } }
        : { NOT: { emailSends: { some: { bouncedAt: { not: null } } } } });
      continue;
    }
    if (field === 'emailUnsubscribed') {
      conditions.push(value === 'true' || value === true
        ? { emailSends: { some: { unsubscribedAt: { not: null } } } }
        : { NOT: { emailSends: { some: { unsubscribedAt: { not: null } } } } });
      continue;
    }
    if (field === 'emailSendCount') {
      // This is approximate — uses "has at least N sends"
      // For exact count, would need raw SQL
      const n = parseInt(String(value)) || 0;
      if (operator === 'GREATER_THAN') {
        conditions.push({ emailSends: { some: {} } }); // At least 1 — limited without raw SQL
      } else if (operator === 'EQUALS' && n === 0) {
        conditions.push({ emailSends: { none: {} } });
      }
      continue;
    }

    // ── UTM / Lead Tracking ───────────────────────────────────────────
    if (['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'landingPage', 'referrer'].includes(field)) {
      const trackingField = field === 'landingPage' ? 'landingPage' : field;
      conditions.push({ leadTrackings: { some: { [trackingField]: mapOp(operator, value) } } });
      continue;
    }

    // ── WhatsApp ──────────────────────────────────────────────────────
    if (field === 'hasWhatsAppConversation') {
      conditions.push(value === 'true' || value === true
        ? { whatsappConversations: { some: {} } }
        : { whatsappConversations: { none: {} } });
      continue;
    }
    if (field === 'whatsAppOptedOut') {
      conditions.push(value === 'true' || value === true
        ? { whatsappConversations: { some: { optedOut: true } } }
        : { NOT: { whatsappConversations: { some: { optedOut: true } } } });
      continue;
    }
    if (field === 'whatsAppStatus') {
      conditions.push({ whatsappConversations: { some: { status: mapOp(operator, value) } } });
      continue;
    }

    // ── Relative dates ────────────────────────────────────────────────
    if (field === 'createdDaysAgo') {
      const days = parseInt(String(value)) || 0;
      const date = new Date();
      date.setDate(date.getDate() - days);
      if (operator === 'LESS_THAN') {
        conditions.push({ createdAt: { gte: date } }); // Created less than N days ago = recent
      } else if (operator === 'GREATER_THAN') {
        conditions.push({ createdAt: { lte: date } }); // Created more than N days ago = old
      }
      continue;
    }
    if (field === 'lastActivityDaysAgo') {
      const days = parseInt(String(value)) || 0;
      const date = new Date();
      date.setDate(date.getDate() - days);
      if (operator === 'LESS_THAN') {
        conditions.push({ activities: { some: { createdAt: { gte: date } } } });
      } else if (operator === 'GREATER_THAN') {
        conditions.push({ NOT: { activities: { some: { createdAt: { gte: date } } } } });
      }
      continue;
    }

    // ── Automation enrollment ─────────────────────────────────────────
    if (field === 'inAutomation') {
      conditions.push(value === 'true' || value === true
        ? { automationEnrollments: { some: { status: 'ACTIVE' } } }
        : { NOT: { automationEnrollments: { some: { status: 'ACTIVE' } } } });
      continue;
    }

    // ── Has meeting ───────────────────────────────────────────────────
    if (field === 'hasMeeting') {
      conditions.push(value === 'true' || value === true
        ? { calendlyEvents: { some: { status: 'active' } } }
        : { NOT: { calendlyEvents: { some: { status: 'active' } } } });
      continue;
    }

    // ── Direct contact fields ─────────────────────────────────────────
    const isDateField = ['createdAt', 'updatedAt', 'birthday'].includes(field);
    const parsedValue = isDateField ? coerceDate(value) : value;
    conditions.push({ [field]: mapOp(operator, parsedValue) });
  }

  return conditions;
}

/**
 * Builds a Prisma `where` clause from either:
 * - A flat array of SegmentFilter (old format, all AND — backward compatible)
 * - An array of FilterGroup (new format, AND within group, OR between groups)
 *
 * Examples:
 *   // Old format — still works
 *   buildSegmentWhere([{ field: 'email', operator: 'EXISTS', value: 'true' }])
 *
 *   // New format — OR between groups
 *   buildSegmentWhere([
 *     { filters: [{ field: 'dealStageName', operator: 'EQUALS', value: 'Contato Feito' }, { field: 'dealStatus', operator: 'EQUALS', value: 'OPEN' }] },
 *     { filters: [{ field: 'dealStageName', operator: 'EQUALS', value: 'Marcar Reunião' }, { field: 'dealStatus', operator: 'EQUALS', value: 'LOST' }] },
 *   ])
 */
export function buildSegmentWhere(
  input: SegmentFilter[] | FilterGroup[],
  brand?: Brand,
): Record<string, any> {
  if (!Array.isArray(input) || input.length === 0) {
    return brand ? { brand } : {};
  }

  if (isFilterGroupArray(input)) {
    // New format: array of FilterGroup
    return buildSegmentWhereFromGroups(input, brand);
  }

  // Old format: flat SegmentFilter[] — treat as single AND group (backward compatible)
  const conds = buildConditions(input as SegmentFilter[]);
  const base = conds.length > 0 ? { AND: conds } : {};
  return brand ? { ...base, brand } : base;
}

/**
 * Builds Prisma `where` for an array of FilterGroups (OR between groups, AND within each group).
 * Can be called directly when you already have the new FilterGroup format.
 */
export function buildSegmentWhereFromGroups(
  filterGroups: FilterGroup[],
  brand?: Brand,
): Record<string, any> {
  const validGroups = filterGroups.filter(g => g.filters && g.filters.length > 0);
  if (validGroups.length === 0) return brand ? { brand } : {};

  const orBranches = validGroups.map(group => {
    const andConditions = buildConditions(group.filters);
    return andConditions.length > 0 ? { AND: andConditions } : null;
  }).filter(Boolean) as Record<string, any>[];

  if (orBranches.length === 0) return brand ? { brand } : {};
  const base = orBranches.length === 1 ? orBranches[0] : { OR: orBranches };
  return brand ? { ...base, brand } : base;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapOp(operator: string, value: any): any {
  switch (operator) {
    case 'EQUALS': return { equals: value };
    case 'NOT_EQUALS': return { not: value };
    case 'CONTAINS': return { contains: value, mode: 'insensitive' };
    case 'NOT_CONTAINS': return { not: { contains: value, mode: 'insensitive' } };
    case 'STARTS_WITH': return { startsWith: value, mode: 'insensitive' };
    case 'GREATER_THAN': return { gt: value };
    case 'LESS_THAN': return { lt: value };
    case 'IN': return { in: Array.isArray(value) ? value : String(value).split(',').filter(Boolean) };
    case 'NOT_IN': return { notIn: Array.isArray(value) ? value : String(value).split(',').filter(Boolean) };
    case 'BETWEEN': return { gte: Array.isArray(value) ? value[0] : value, lte: Array.isArray(value) ? value[1] : value };
    case 'EXISTS': return value === 'true' ? { not: null } : null;
    default: return { equals: value };
  }
}

function coerceDate(value: any): any {
  if (Array.isArray(value)) return value.map((v: any) => new Date(v));
  if (typeof value === 'string') return new Date(value);
  return value;
}

function coerceNumber(value: any): any {
  if (Array.isArray(value)) return value.map((v: any) => parseFloat(v));
  return parseFloat(value);
}
