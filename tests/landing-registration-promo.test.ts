// tests/landing-registration-promo.test.ts
import { describe, it, expect } from "vitest";
import { applyPromo, promoMessage, type PromoCode, type PromoFailureReason } from "@/lib/landing/registration/promo";

const NOW = new Date("2026-10-13T12:00:00Z");
const promo = (p: Partial<PromoCode> = {}): PromoCode => ({
  id: "promo-1", code: "PPC10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0,
  pageIds: [], optionKeys: [], maxUses: null, usedCount: 0, oneperEmail: false,
  startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...p,
});
const apply = (p: PromoCode | null, extra: Partial<Parameters<typeof applyPromo>[0]> = {}) =>
  applyPromo({ promo: p, pageId: "page-1", optionKeys: ["full"], currency: "PKR", total: 4800, now: NOW, emailAlreadyUsed: false, ...extra });

describe("applyPromo: amounts", () => {
  it("takes 10% off the Early Bird individual total: 4,800 -> 4,320", () => {
    expect(apply(promo())).toEqual({ ok: true, promoId: "promo-1", code: "PPC10", discount: 480, total: 4320 });
  });
  it("applies after the group price: 10% of the 11,500 group total", () => {
    expect(apply(promo(), { total: 11500 })).toMatchObject({ ok: true, discount: 1150, total: 10350 });
  });
  it("rounds the discount to a whole amount", () => {
    expect(apply(promo(), { total: 4805 })).toMatchObject({ discount: 481, total: 4324 });
  });
  it("caps a percent code at max_discount_percent", () => {
    expect(apply(promo({ value: 50, maxDiscountPercent: 30 }))).toMatchObject({ discount: 1440, total: 3360 });
  });
  it("never discounts more than the total", () => {
    expect(apply(promo({ value: 150 }))).toMatchObject({ discount: 4800, total: 0 });
    expect(apply(promo({ type: "fixed", value: 0, fixedAmounts: { PKR: 9999 } }))).toMatchObject({ discount: 4800, total: 0 });
  });
  it("uses the per-currency amount for a fixed code, capped by max_discount_percent", () => {
    expect(apply(promo({ type: "fixed", fixedAmounts: { PKR: 500, USD: 5 } }))).toMatchObject({ discount: 500, total: 4300 });
    expect(apply(promo({ type: "fixed", fixedAmounts: { USD: 5 } }), { currency: "USD", total: 44 })).toMatchObject({ discount: 5, total: 39 });
    expect(apply(promo({ type: "fixed", fixedAmounts: { PKR: 2000 }, maxDiscountPercent: 10 }))).toMatchObject({ discount: 480 });
  });
  it("a free registration stays free", () => {
    expect(apply(promo(), { total: 0 })).toMatchObject({ ok: true, discount: 0, total: 0 });
  });
});

describe("applyPromo: refusals", () => {
  it("unknown when there is no code", () => expect(apply(null)).toEqual({ ok: false, reason: "unknown" }));
  it("inactive", () => expect(apply(promo({ active: false }))).toEqual({ ok: false, reason: "inactive" }));
  it("not_started before starts_at, fine from that instant", () => {
    expect(apply(promo({ startsAt: "2026-10-14T00:00:00Z" }))).toEqual({ ok: false, reason: "not_started" });
    expect(apply(promo({ startsAt: NOW.toISOString() }))).toMatchObject({ ok: true });
  });
  it("expired from ends_at on", () => {
    expect(apply(promo({ endsAt: NOW.toISOString() }))).toEqual({ ok: false, reason: "expired" });
    expect(apply(promo({ endsAt: "2026-10-13T12:00:01Z" }))).toMatchObject({ ok: true });
  });
  it("exhausted when every use is taken; unlimited when max_uses is null", () => {
    expect(apply(promo({ maxUses: 20, usedCount: 20 }))).toEqual({ ok: false, reason: "exhausted" });
    expect(apply(promo({ maxUses: 20, usedCount: 19 }))).toMatchObject({ ok: true });
    expect(apply(promo({ maxUses: null, usedCount: 5000 }))).toMatchObject({ ok: true });
  });
  it("wrong_page when the code is for other pages", () => {
    expect(apply(promo({ pageIds: ["page-2"] }))).toEqual({ ok: false, reason: "wrong_page" });
    expect(apply(promo({ pageIds: ["page-2", "page-1"] }))).toMatchObject({ ok: true });
  });
  it("wrong_option unless every chosen option is covered", () => {
    expect(apply(promo({ optionKeys: ["m1"] }))).toEqual({ ok: false, reason: "wrong_option" });
    expect(apply(promo({ optionKeys: ["m1"] }), { optionKeys: ["m1", "m2"] })).toEqual({ ok: false, reason: "wrong_option" });
    expect(apply(promo({ optionKeys: ["m1", "m2", "m3"] }), { optionKeys: ["m1", "m2"] })).toMatchObject({ ok: true });
  });
  it("wrong_option for a fixed code without an amount in this currency", () => {
    expect(apply(promo({ type: "fixed", fixedAmounts: { PKR: 500 } }), { currency: "AED", total: 160 })).toEqual({ ok: false, reason: "wrong_option" });
  });
  it("already_used only when the code is one per email", () => {
    expect(apply(promo({ oneperEmail: true }), { emailAlreadyUsed: true })).toEqual({ ok: false, reason: "already_used" });
    expect(apply(promo({ oneperEmail: false }), { emailAlreadyUsed: true })).toMatchObject({ ok: true });
  });
  it("reports inactive before expired", () => {
    expect(apply(promo({ active: false, endsAt: "2026-01-01T00:00:00Z" }))).toEqual({ ok: false, reason: "inactive" });
  });
});

describe("applyPromo: hardening", () => {
  it("does not read inherited keys as a fixed amount", () => {
    expect(apply(promo({ type: "fixed", fixedAmounts: {} }), { currency: "constructor" })).toEqual({ ok: false, reason: "wrong_option" });
  });
  it("never returns NaN or non-integer amounts", () => {
    expect(apply(promo({ value: NaN }))).toMatchObject({ ok: true, discount: 0, total: 4800 });
    expect(apply(promo(), { total: NaN })).toMatchObject({ ok: true, discount: 0, total: 0 });
  });
});

describe("promoMessage", () => {
  it("gives a distinct plain sentence for every reason", () => {
    const reasons: PromoFailureReason[] = ["unknown", "inactive", "not_started", "expired", "exhausted", "wrong_page", "wrong_option", "already_used"];
    const texts = reasons.map(promoMessage);
    for (const t of texts) expect(t).toMatch(/^[A-Z].+\.$/);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(promoMessage("expired")).toBe("This promo code has expired.");
  });
});
