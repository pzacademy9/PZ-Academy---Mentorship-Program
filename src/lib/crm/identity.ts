import { phoneTail } from "./phone";

/**
 * Identity normalization and duplicate scoring for the CRM import. Pure —
 * no I/O, no database.
 *
 * The split between "same" (auto-merge) and "review" (queue for a human) is
 * deliberate and conservative. Auto-merge requires an exact match on a
 * genuinely unique field. Everything weaker is a suggestion for a person to
 * confirm, because an incorrect auto-merge silently destroys one contact's
 * purchase history and is not detectable after the fact.
 */

export type DuplicateInput = {
  email: string | null;
  phoneE164: string | null;
  fullName: string;
};

export type DuplicateVerdict =
  | { kind: "same"; reason: string }
  | { kind: "review"; reason: string; confidence: number }
  | { kind: "different" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;
  return EMAIL_RE.test(value) ? value : null;
}

// Honorifics are stripped so "Dr.Awais Ahmed" and "Awais Ahmed" — which
// appear as separate rows across these sheets — compare as one person.
const HONORIFICS = new Set(["dr", "dr.", "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss", "prof", "prof."]);

export function normalizeName(raw: string | null | undefined): string {
  if (raw == null) return "";
  // "Dr.Awais" has no space after the period, so split on periods too, then
  // re-join. Keeps "Dr.Awais Ahmed" from being read as a single token.
  const words = raw
    .replace(/\./g, ". ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w !== "");

  const kept = words.filter((w) => !HONORIFICS.has(w.toLowerCase()));
  return kept
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function emailLocalPart(email: string): string {
  return email.split("@")[0] ?? "";
}

export function scoreDuplicate(a: DuplicateInput, b: DuplicateInput): DuplicateVerdict {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  const nameA = normalizeName(a.fullName);
  const nameB = normalizeName(b.fullName);

  // ─── Auto-merge: exact match on a unique field ───
  if (emailA && emailB && emailA === emailB) {
    return { kind: "same", reason: "identical email" };
  }
  if (a.phoneE164 && b.phoneE164 && a.phoneE164 === b.phoneE164) {
    return { kind: "same", reason: "identical phone" };
  }

  // Below here a name match is required. Without it there is no evidence at
  // all, and two contacts sharing neither email nor phone are two people.
  const namesMatch = nameA !== "" && nameA === nameB;
  if (!namesMatch) return { kind: "different" };

  // ─── Review: same name plus corroborating near-match ───
  if (a.phoneE164 && b.phoneE164 && phoneTail(a.phoneE164) === phoneTail(b.phoneE164)) {
    return { kind: "review", reason: "same name, same phone tail, different normalization", confidence: 0.9 };
  }

  if (emailA && emailB && emailLocalPart(emailA) === emailLocalPart(emailB)) {
    return { kind: "review", reason: "same name, same email local-part, different domain", confidence: 0.8 };
  }

  return { kind: "different" };
}
