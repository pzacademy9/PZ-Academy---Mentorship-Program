/**
 * Phone normalization for the CRM import. Pure — no I/O, no database.
 *
 * Deliberately conservative: anything that does not match a known rule is
 * reported ambiguous rather than guessed. A wrongly normalized number is an
 * unreachable contact that fails silently, and that failure only becomes
 * visible after the WhatsApp Business API is bought. A short manual review
 * list is far cheaper than silent data loss.
 *
 * Markets served: Pakistan (+92), UAE (+971), Saudi Arabia (+966).
 */

export type PhoneResult =
  | { ok: true; e164: string; country: "PK" | "AE" | "SA" }
  | { ok: false; reason: "empty" | "ambiguous" };

/** Digit counts include the country code. */
const RULES: ReadonlyArray<{ prefix: string; totalDigits: number; country: "PK" | "AE" | "SA" }> = [
  { prefix: "92", totalDigits: 12, country: "PK" },
  { prefix: "971", totalDigits: 12, country: "AE" },
  { prefix: "966", totalDigits: 12, country: "SA" },
];

export function normalizePhone(raw: string | null | undefined): PhoneResult {
  if (raw == null) return { ok: false, reason: "empty" };

  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  // Two numbers in one cell: separated by a slash, comma, semicolon, or the
  // word "or". Detected BEFORE stripping punctuation, because stripping
  // would silently concatenate them into one plausible-looking long number.
  if (/[\/,;]|\bor\b/i.test(trimmed)) return { ok: false, reason: "ambiguous" };

  let digits = trimmed.replace(/\D/g, "");
  if (digits === "") return { ok: false, reason: "ambiguous" };

  // International dialling prefix.
  if (digits.startsWith("00")) digits = digits.slice(2);

  for (const rule of RULES) {
    if (digits.startsWith(rule.prefix) && digits.length === rule.totalDigits) {
      return { ok: true, e164: `+${digits}`, country: rule.country };
    }
  }

  // Local Pakistani formats. Mobile numbers always begin with 3 once the
  // trunk prefix is removed, which is what makes these two rules safe.
  if (digits.length === 11 && digits.startsWith("03")) {
    return { ok: true, e164: `+92${digits.slice(1)}`, country: "PK" };
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    return { ok: true, e164: `+92${digits}`, country: "PK" };
  }

  return { ok: false, reason: "ambiguous" };
}

/**
 * Last nine digits of a normalized number, used by duplicate scoring to
 * catch the same human entered under two different formats. Nine rather
 * than ten because that is the subscriber-number length shared by all three
 * supported countries once the country code is removed.
 */
export function phoneTail(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-9);
}
