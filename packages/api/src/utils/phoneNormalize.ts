/**
 * Normalizes Brazilian phone numbers to a canonical format: 55 + DDD(2) + 9 + 8 digits
 *
 * The WhatsApp API sometimes returns numbers without the mobile "9" digit
 * (e.g. 5554XXXXXXXX instead of 55549XXXXXXXX), causing duplicate conversations.
 * This function ensures all numbers are stored with the 9.
 *
 * Examples:
 *   "5554996891536"   → "5554996891536"  (already correct — 13 digits)
 *   "555496891536"    → "5554996891536"  (missing 9 — 12 digits, insert 9 after DDD)
 *   "54996891536"     → "5554996891536"  (no country code — 11 digits)
 *   "5496891536"      → "5554996891536"  (no country code, no 9 — 10 digits)
 *   "+55 (54) 99689-1536" → "5554996891536"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // 10 digits: DDD(2) + 8 digits — missing country code AND 9
  if (digits.length === 10) {
    return '55' + digits.slice(0, 2) + '9' + digits.slice(2);
  }

  // 11 digits: DDD(2) + 9 + 8 digits — missing country code only
  if (digits.length === 11) {
    return '55' + digits;
  }

  // 12 digits: 55 + DDD(2) + 8 digits — missing the 9
  if (digits.length === 12 && digits.startsWith('55')) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }

  // 13 digits: 55 + DDD(2) + 9 + 8 digits — already correct
  return digits;
}

/**
 * Given a normalized phone, returns both variants (with and without 9)
 * for searching existing conversations that may have been stored either way.
 */
export function phoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  // normalized is always 13 digits: 55 + DD + 9 + XXXXXXXX
  // variant without 9: 55 + DD + XXXXXXXX (12 digits)
  const without9 = normalized.slice(0, 4) + normalized.slice(5);
  return [normalized, without9];
}
