// ─────────────────────────────────────────────────────────────────────────────
// Phone normalisation — the write-side backstop. Whatever format a client is
// typed in, it lands in the DB as E.164 (+91XXXXXXXXXX), so lookups, WhatsApp
// sends and duplicate detection all see one shape.
//
// Mirrors src/lib/phone.ts on the frontend — keep the two in step.
// ─────────────────────────────────────────────────────────────────────────────

/** Storage format: a bare 10-digit number becomes +91XXXXXXXXXX. */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s()-]/g, '');
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  if (/^0\d{10}$/.test(cleaned)) return `+91${cleaned.slice(1)}`;
  if (/^91\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

/**
 * Comparison key — the last 10 digits. Empty when there aren't 10 digits, which
 * callers must treat as "cannot match" rather than "matches everything".
 */
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}
