export interface SegmentFilter {
  field: string;
  operator: string;
  value: any;
}

const VALID_SEGMENT_FIELDS = new Set([
  'name', 'email', 'phone', 'city', 'state', 'position', 'notes',
  'createdAt', 'updatedAt',
  // Special/relation fields handled separately
  'tags', 'engagementLevel', 'score',
]);

export function buildSegmentWhere(filters: SegmentFilter[]): Record<string, any> {
  const conditions: Record<string, any>[] = [];

  for (const filter of filters) {
    const { field, operator, value } = filter;

    // Reject fields not in the whitelist to prevent arbitrary Prisma field access
    if (!VALID_SEGMENT_FIELDS.has(field)) {
      throw new Error(`Invalid segment field: "${field}". Allowed fields: ${[...VALID_SEGMENT_FIELDS].join(', ')}`);
    }

    // Special fields that map to relations
    if (field === 'tags') {
      conditions.push({ tags: { some: { tagId: { in: value } } } });
      continue;
    }

    if (field === 'engagementLevel') {
      const prismaOp = mapOperatorToCondition(operator, value);
      conditions.push({ leadScore: { engagementLevel: prismaOp } });
      continue;
    }

    if (field === 'score') {
      const prismaOp = mapOperatorToCondition(operator, value);
      conditions.push({ leadScore: { score: prismaOp } });
      continue;
    }

    // Date fields need ISO conversion
    const isDateField = ['createdAt', 'updatedAt', 'birthday'].includes(field);
    const parsedValue = isDateField ? coerceDate(value) : value;

    const condition = mapOperatorToCondition(operator, parsedValue);
    conditions.push({ [field]: condition });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

function coerceDate(value: any): any {
  if (Array.isArray(value)) return value.map((v: any) => new Date(v));
  if (typeof value === 'string') return new Date(value);
  return value;
}

function mapOperatorToCondition(operator: string, value: any): any {
  switch (operator) {
    case 'EQUALS':
      return { equals: value };

    case 'CONTAINS':
      return { contains: value, mode: 'insensitive' };

    case 'GREATER_THAN':
      return { gt: value };

    case 'LESS_THAN':
      return { lt: value };

    case 'IN':
      return { in: value };

    case 'NOT_IN':
      return { notIn: value };

    case 'BETWEEN':
      return { gte: value[0], lte: value[1] };

    default:
      return { equals: value };
  }
}
