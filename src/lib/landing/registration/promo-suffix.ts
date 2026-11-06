// src/lib/landing/registration/promo-suffix.ts
// Pure rules for owner codes: "TEST-111-10%" is the owner code TEST-111 asking for 10% off.
import type { PromoCode } from "./promo";

const SUFFIX_RE = /^(.+)-(\d{1,3})%$/;
const BASE_RE = /^[A-Z0-9_-]{2,40}$/;

/** Input is already uppercase with spaces removed. Whole numbers 1 to 100 only; the % sign is required. */
export function parsePromoSuffix(typed: string): { base: string; percent: number } | null {
  const m = SUFFIX_RE.exec(typed);
  if (!m) return null;
  const percent = Number(m[2]);
  if (percent < 1 || percent > 100 || !BASE_RE.test(m[1])) return null;
  return { base: m[1], percent };
}

/** The owner's code seen as an ordinary percent code, so applyPromo can judge it unchanged. */
export function effectiveOwnerPromo(p: {
  owner: PromoCode;
  typed: string;
  /** null = the owner code was typed plain */
  percent: number | null;
  globalMax: number;
}): { ok: true; promo: PromoCode } | { ok: false; reason: "over_max"; max: number } {
  const max = Math.min(p.globalMax, p.owner.maxPercent ?? p.globalMax);
  // A typed percent above the ceiling is refused. A plain code (nothing typed) is never refused: it is held down to the ceiling.
  if (p.percent !== null && p.percent > max) return { ok: false, reason: "over_max", max };
  const percent = p.percent ?? Math.min(p.owner.plainPercent ?? 10, max);
  return {
    ok: true,
    promo: { ...p.owner, code: p.typed, type: "percent", value: percent, fixedAmounts: {}, maxDiscountPercent: 0 },
  };
}
