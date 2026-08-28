// ─────────────────────────────────────────────────────────────────────────────
// Phone numbers — one implementation, used by every screen that stores or
// compares one. Storage format is E.164 (+91XXXXXXXXXX); comparison is done on
// the last 10 digits so "+91 98765 43210", "098765-43210" and "9876543210" all
// resolve to the same person regardless of how they were typed or stored.
//
// The server applies the same normalisation on write (server/src/lib/phone.ts),
// so these two must be kept in step.
// ─────────────────────────────────────────────────────────────────────────────

/** True for a plausible Indian mobile, with or without the +91 prefix. */
export function validateIndianMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, "");
  return /^(\+91)?[6-9]\d{9}$/.test(cleaned);
}

/** Storage format: a bare 10-digit number becomes +91XXXXXXXXXX. */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(cleaned)) return "+91" + cleaned;
  return cleaned;
}

/**
 * Comparison key — the last 10 digits, ignoring +91, spaces, dashes and
 * brackets. Empty string when there aren't 10 digits to compare, which callers
 * must treat as "no match possible" rather than "matches everything".
 */
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** Do these two numbers refer to the same line? */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneKey(a);
  return ka !== "" && ka === phoneKey(b);
}
