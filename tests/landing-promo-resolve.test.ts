import { describe, expect, it, vi } from "vitest";
import { applyPromo, type PromoCode } from "@/lib/landing/registration/promo";
import { resolvePromoWith } from "@/lib/landing/registration/promo-resolve";

const base = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "p1", code: "X", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...over,
});
const ownerCode = (over: Partial<PromoCode> = {}) =>
  base({ id: "own1", code: "TEST-111", value: 0, ownerAgentId: "agent-1", isOwnerCode: true, plainPercent: 10, maxPercent: null, ...over });

function deps(codes: PromoCode[], max = 30) {
  const getByCode = vi.fn(async (c: string) => codes.find((p) => p.code === c) ?? null);
  const getMax = vi.fn(async () => max);
  return { getByCode, getMax };
}

describe("resolvePromoWith", () => {
  it("returns an ordinary code untouched and never reads the ceiling", async () => {
    const d = deps([base({ code: "PZ10" })]);
    expect(await resolvePromoWith("PZ10", d)).toMatchObject({ promo: { code: "PZ10", value: 10 }, overMax: null });
    expect(d.getMax).not.toHaveBeenCalled();
  });
  it("does not read a suffix on an ordinary (non-owner) code", async () => {
    const d = deps([base({ code: "SUMMER" })]);
    expect(await resolvePromoWith("SUMMER-10%", d)).toEqual({ promo: null, overMax: null });
  });
  it("gives the plain percent for a plain owner code", async () => {
    const r = await resolvePromoWith("TEST-111", deps([ownerCode()]));
    expect(r.promo).toMatchObject({ id: "own1", value: 10, ownerAgentId: "agent-1" });
  });
  it("gives the typed percent for a suffix, including 15 and 25", async () => {
    for (const n of [10, 15, 20, 25, 30]) {
      const r = await resolvePromoWith(`TEST-111-${n}%`, deps([ownerCode()]));
      expect(r.promo).toMatchObject({ id: "own1", value: n, code: `TEST-111-${n}%` });
    }
  });
  it("reports the ceiling when the typed percent is too high", async () => {
    expect(await resolvePromoWith("TEST-111-35%", deps([ownerCode()]))).toEqual({ promo: null, overMax: 30 });
  });
  it("lets an exact stored code win over reading a suffix", async () => {
    const d = deps([base({ id: "lit", code: "PZ-MDC-20%".replace("%", "") }), ownerCode({ code: "PZ-MDC" })]);
    expect((await resolvePromoWith("PZ-MDC-20", d)).promo?.id).toBe("lit");
  });
  it("keeps a paused owner code paused for the suffix form", async () => {
    const r = await resolvePromoWith("TEST-111-10%", deps([ownerCode({ active: false })]));
    expect(r.promo?.active).toBe(false);
    const applied = applyPromo({ promo: r.promo, pageId: "x", optionKeys: [], currency: "PKR", total: 1000, now: new Date(), emailAlreadyUsed: false });
    expect(applied).toEqual({ ok: false, reason: "inactive" });
  });
  it("a plain owner code with 0% still resolves and gives no discount", async () => {
    const r = await resolvePromoWith("TEST-111", deps([ownerCode({ plainPercent: 0 })]));
    expect(r.promo).toMatchObject({ id: "own1", value: 0 });
  });
  it("reads a code typed with spaces and lowercase as the clean code", async () => {
    for (const typed of ["TEST-111 -10 %", "TEST-111- 10%", "TEST-111-10 %"]) {
      expect((await resolvePromoWith(typed, deps([ownerCode()]))).promo, typed).toMatchObject({ id: "own1", value: 10 });
    }
  });
  it("ignores the owner behaviour when the owner is gone (agent deleted)", async () => {
    const orphan = ownerCode({ ownerAgentId: null });
    expect(await resolvePromoWith("TEST-111-10%", deps([orphan]))).toEqual({ promo: null, overMax: null });
  });
  it("answers null for an unknown code and for an unknown suffix base", async () => {
    expect(await resolvePromoWith("NOPE", deps([]))).toEqual({ promo: null, overMax: null });
    expect(await resolvePromoWith("NOPE-10%", deps([]))).toEqual({ promo: null, overMax: null });
  });
});
