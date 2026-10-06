/**
 * Phone normalization for the CRM import. Pure — no I/O, no database.
 *
 * Deliberately conservative: anything that does not match a known rule is
 * reported ambiguous rather than guessed. A wrongly normalized number is an
 * unreachable contact that fails silently, and that failure only becomes
 * visible after the WhatsApp Business API is bought. A short manual review
 * list is far cheaper than silent data loss.
 *
 * Every country is supported when the number carries its country code
 * ("+63 ..." or "0063 ..."), validated with libphonenumber-js. Pakistan
 * (+92), UAE (+971) and Saudi Arabia (+966) additionally accept local and
 * bare-prefixed formats. Digits without a "+" or "00" that match none of
 * those rules stay ambiguous: no country is ever guessed.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneResult =
  | { ok: true; e164: string; country: string }
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
  const hadDoubleZero = digits.startsWith("00");
  if (hadDoubleZero) digits = digits.slice(2);

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

  // Any other country: only when the number explicitly carries its country
  // code ("+" or "00"), and only if libphonenumber confirms it is valid.
  if (trimmed.startsWith("+") || hadDoubleZero) {
    const parsed = parsePhoneNumberFromString(`+${digits}`);
    if (parsed && parsed.isValid() && parsed.country) {
      return { ok: true, e164: parsed.number, country: parsed.country };
    }
  }

  return { ok: false, reason: "ambiguous" };
}

/**
 * Last nine digits of a normalized number, used by duplicate scoring to
 * catch the same human entered under two different formats. Nine rather
 * than ten because that is the subscriber-number length shared by the
 * PK/AE/SA numbers once the country code is removed; longer international
 * numbers still match on their last nine digits.
 */
export function phoneTail(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return digits.slice(-9);
}
