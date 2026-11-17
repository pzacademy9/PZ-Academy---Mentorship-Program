import { describe, expect, it } from "vitest";
import { applyPromo, type PromoCode } from "@/lib/landing/registration/promo";
import { effectiveOrdinaryPromo, effectiveOwnerPromo, parsePromoSuffix } from "@/lib/landing/registration/promo-suffix";

function owner(over: Partial<PromoCode> = {}): PromoCode {
  return {
    id: "p1", code: "TEST-111", type: "percent", value: 0, fixedAmounts: {}, maxDiscountPercent: 0,
    pageIds: [], optionKeys: [], maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null,
    active: true, ownerAgentId: "agent-1", isOwnerCode: true, plainPercent: 10, maxPercent: null, ...over,
  };
}

describe("parsePromoSuffix", () => {
  it("reads a trailing -NN%", () => {
    expect(parsePromoSuffix("TEST-111-10%")).toEqual({ base: "TEST-111", percent: 10 });
    expect(parsePromoSuffix("TEST-111-20%")).toEqual({ base: "TEST-111", percent: 20 });
    expect(parsePromoSuffix("TEST-111-15%")).toEqual({ base: "TEST-111", percent: 15 });
    expect(parsePromoSuffix("TEST-111-25%")).toEqual({ base: "TEST-111", percent: 25 });
  });
  it("is not a suffix for 0, over 100, decimals, no percent sign or a too-short base", () => {
    for (const t of ["TEST-111-0%", "TEST-111-101%", "TEST-111-10.5%", "TEST-111-10", "A-10%", "TEST-111%"]) {
      expect(parsePromoSuffix(t)).toBeNull();
    }
  });
});

describe("effectiveOwnerPromo", () => {
  it("builds a percent promo for a suffix, keeping the owner's id", () => {
    const r = effectiveOwnerPromo({ owner: owner(), typed: "TEST-111-10%", percent: 10, globalMax: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.promo.value).toBe(10);
      expect(r.promo.id).toBe("p1");
      expect(r.promo.code).toBe("TEST-111-10%");
      const applied = applyPromo({ promo: r.promo, pageId: "x", optionKeys: [], currency: "PKR", total: 1000, now: new Date(), emailAlreadyUsed: false });
      expect(applied).toMatchObject({ ok: true, discount: 100, total: 900 });
    }
  });
  it("refuses a percent above the global ceiling", () => {
    expect(effectiveOwnerPromo({ owner: owner(), typed: "TEST-111-35%", percent: 35, globalMax: 30 })).toEqual({ ok: false, reason: "over_max", max: 30 });
  });
  it("lets a person's own lower maximum win", () => {
    expect(effectiveOwnerPromo({ owner: owner({ maxPercent: 15 }), typed: "TEST-111-20%", percent: 20, globalMax: 30 })).toEqual({ ok: false, reason: "over_max", max: 15 });
  });
  it("uses the plain percent when none is typed", () => {
    const r = effectiveOwnerPromo({ owner: owner(), typed: "TEST-111", percent: null, globalMax: 30 });
    expect(r.ok && r.promo.value).toBe(10);
  });
  it("never refuses a plain code: its percent is held down to the ceiling instead", () => {
    const r = effectiveOwnerPromo({ owner: owner({ plainPercent: 10 }), typed: "TEST-111", percent: null, globalMax: 5 });
    expect(r.ok && r.promo.value).toBe(5);
    const own = effectiveOwnerPromo({ owner: owner({ plainPercent: 10, maxPercent: 8 }), typed: "TEST-111", percent: null, globalMax: 30 });
    expect(own.ok && own.promo.value).toBe(8);
  });
  it("gives no discount but still resolves when the plain percent is 0", () => {
    const r = effectiveOwnerPromo({ owner: owner({ plainPercent: 0 }), typed: "TEST-111", percent: null, globalMax: 30 });
    expect(r.ok && r.promo.value).toBe(0);
  });
});

describe("effectiveOrdinaryPromo", () => {
  const ordinary = (over: Partial<PromoCode> = {}): PromoCode =>
    owner({ id: "o1", code: "SAVE", value: 10, ownerAgentId: null, isOwnerCode: false, plainPercent: undefined, maxPercent: undefined, ...over });
  it("builds a percent promo at the typed percent, keeping the base id", () => {
    const r = effectiveOrdinaryPromo({ code: ordinary(), typed: "SAVE-15%", percent: 15, globalMax: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.promo).toMatchObject({ type: "percent", value: 15, fixedAmounts: {}, maxDiscountPercent: 0, code: "SAVE-15%", id: "o1" });
    }
  });
  it("refuses a percent above the global ceiling", () => {
    expect(effectiveOrdinaryPromo({ code: ordinary(), typed: "SAVE-31%", percent: 31, globalMax: 30 })).toEqual({ ok: false, reason: "over_max", max: 30 });
  });
  it("uses the code's own cap as the ceiling when it is lower than the global one", () => {
    const capped = ordinary({ maxDiscountPercent: 20 });
    expect(effectiveOrdinaryPromo({ code: capped, typed: "SAVE-25%", percent: 25, globalMax: 30 })).toEqual({ ok: false, reason: "over_max", max: 20 });
    expect(effectiveOrdinaryPromo({ code: capped, typed: "SAVE-20%", percent: 20, globalMax: 30 }).ok).toBe(true);
  });
  it("uses only the global ceiling when the code has no cap (0)", () => {
    expect(effectiveOrdinaryPromo({ code: ordinary({ maxDiscountPercent: 0 }), typed: "SAVE-30%", percent: 30, globalMax: 30 }).ok).toBe(true);
    expect(effectiveOrdinaryPromo({ code: ordinary({ maxDiscountPercent: 0 }), typed: "SAVE-31%", percent: 31, globalMax: 30 })).toEqual({ ok: false, reason: "over_max", max: 30 });
  });
  it("never lets a code's cap raise the ceiling above the global one", () => {
    expect(effectiveOrdinaryPromo({ code: ordinary({ maxDiscountPercent: 50 }), typed: "SAVE-40%", percent: 40, globalMax: 30 })).toEqual({ ok: false, reason: "over_max", max: 30 });
  });
  it("gives the typed percent even when the base is a fixed code with a cap above it", () => {
    const r = effectiveOrdinaryPromo({ code: ordinary({ type: "fixed", maxDiscountPercent: 25 }), typed: "SAVE-20%", percent: 20, globalMax: 30 });
    expect(r.ok && r.promo.value).toBe(20);
    expect(r.ok && r.promo.maxDiscountPercent).toBe(0);
  });
});
