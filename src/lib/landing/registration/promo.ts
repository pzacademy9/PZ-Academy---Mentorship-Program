// src/lib/landing/registration/promo.ts
// Pure promo-code rules. The server is the only place a code takes effect (legacy codes were never checked).

export interface PromoCode {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;                          // percent for "percent" codes
  fixedAmounts: Record<string, number>;   // per-currency amount for "fixed" codes
  maxDiscountPercent: number;             // 0 = no cap
  pageIds: string[];                      // [] = every page
  optionKeys: string[];                   // [] = every option
  maxUses: number | null;
  usedCount: number;
  oneperEmail: boolean;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  ownerAgentId: string | null;
}

export type PromoResult =
  | { ok: true; promoId: string; code: string; discount: number; total: number }
  | { ok: false; reason: "unknown" | "inactive" | "not_started" | "expired" | "exhausted" | "wrong_page" | "wrong_option" | "already_used" };

export type PromoFailureReason = Extract<PromoResult, { ok: false }>["reason"];

const fail = (reason: PromoFailureReason): PromoResult => ({ ok: false, reason });

export function applyPromo(p: {
  promo: PromoCode | null;
  pageId: string;
  optionKeys: string[];
  currency: string;
  total: number;
  now: Date;
  emailAlreadyUsed: boolean;
}): PromoResult {
  const promo = p.promo;
  if (!promo) return fail("unknown");
  if (!promo.active) return fail("inactive");
  const now = p.now.getTime();
  if (promo.startsAt && now < Date.parse(promo.startsAt)) return fail("not_started");
  if (promo.endsAt && now >= Date.parse(promo.endsAt)) return fail("expired");
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return fail("exhausted");
  if (promo.pageIds.length > 0 && !promo.pageIds.includes(p.pageId)) return fail("wrong_page");
  if (promo.optionKeys.length > 0 && !p.optionKeys.every((k) => promo.optionKeys.includes(k))) return fail("wrong_option");
  if (promo.oneperEmail && p.emailAlreadyUsed) return fail("already_used");

  const total = Number.isFinite(p.total) ? Math.max(0, Math.round(p.total)) : 0;
  const capPct = promo.maxDiscountPercent > 0 ? promo.maxDiscountPercent : null;
  let discount: number;
  if (promo.type === "percent") {
    const pct = capPct === null ? promo.value : Math.min(promo.value, capPct);
    discount = (total * pct) / 100;
  } else {
    const amount = Object.prototype.hasOwnProperty.call(promo.fixedAmounts, p.currency) ? promo.fixedAmounts[p.currency] : undefined;
    if (typeof amount !== "number" || !Number.isFinite(amount)) return fail("wrong_option");
    discount = capPct === null ? amount : Math.min(amount, (total * capPct) / 100);
  }
  if (!Number.isFinite(discount)) discount = 0;
  discount = Math.min(total, Math.max(0, Math.round(discount)));
  return { ok: true, promoId: promo.id, code: promo.code, discount, total: total - discount };
}

const MESSAGES: Record<PromoFailureReason, string> = {
  unknown: "We could not find that promo code. Check the spelling.",
  inactive: "This promo code is no longer active.",
  not_started: "This promo code is not active yet.",
  expired: "This promo code has expired.",
  exhausted: "This promo code has been fully used.",
  wrong_page: "This promo code is not valid for this event.",
  wrong_option: "This promo code does not apply to what you chose.",
  already_used: "You have already used this promo code.",
};

export function promoMessage(reason: PromoFailureReason): string {
  return MESSAGES[reason];
}
