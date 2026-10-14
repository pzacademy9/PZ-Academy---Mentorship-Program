import { describe, it, expect } from "vitest";
import {
  agentLinkUrl, describeDiscount, draftFromPromo, draftToInput, emptyPromoDraft, isoToPktLocal, normalizeCodeInput, optionChoices,
  patchFromInput, pktLocalToIso, promoState, type PromoDraft, type PromoPageOption,
} from "@/lib/landing/registration/promo-form";
import type { PromoCode } from "@/lib/landing/registration/promo";

const promo = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "promo-1", code: "PZ10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: null, usedCount: 0, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...over,
});
const draft = (over: Partial<PromoDraft> = {}): PromoDraft => ({ ...emptyPromoDraft(), code: "PZ10", value: "10", ...over });

const PAGES: PromoPageOption[] = [
  { id: "p1", title: "PPC Batch 3", options: [{ key: "full", label: "Full Course" }, { key: "m1", label: "Module 1" }] },
  { id: "p2", title: "MDC Batch 3", options: [{ key: "full", label: "Full Workshop" }] },
];

describe("time helpers (Pakistan time in the form, ISO instants on the wire)", () => {
  it("round-trips a datetime-local value", () => {
    expect(pktLocalToIso("2026-10-15T23:59")).toBe("2026-10-15T18:59:00.000Z");
    expect(isoToPktLocal("2026-10-15T18:59:00+00:00")).toBe("2026-10-15T23:59");
    expect(pktLocalToIso("")).toBeNull();
    expect(pktLocalToIso("15/10/2026")).toBeNull();
    expect(isoToPktLocal(null)).toBe("");
    expect(isoToPktLocal("nope")).toBe("");
  });
  it("normalizes a typed code", () => {
    expect(normalizeCodeInput(" pz 10 ")).toBe("PZ10");
  });
});

describe("draftToInput", () => {
  it("builds a percent code for all pages", () => {
    expect(draftToInput(draft({ code: "pz10" }))).toEqual({
      ok: true,
      input: {
        code: "PZ10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
        maxUses: null, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null,
      },
    });
  });
  it("builds a fixed code limited to pages, options, uses and dates", () => {
    const r = draftToInput(draft({
      type: "fixed", value: "", fixedAmounts: { PKR: "500", AED: "", USD: "5" }, scope: "pages", pageIds: ["p1", "p1"], optionKeys: ["full"],
      maxUses: "50", oneperEmail: true, startsAt: "2026-10-01T00:00", endsAt: "2026-10-15T23:59",
    }), "agent-1");
    expect(r).toEqual({
      ok: true,
      input: {
        code: "PZ10", type: "fixed", value: 0, fixedAmounts: { PKR: 500, USD: 5 }, maxDiscountPercent: 0, pageIds: ["p1"], optionKeys: ["full"],
        maxUses: 50, oneperEmail: true, startsAt: "2026-09-30T19:00:00.000Z", endsAt: "2026-10-15T18:59:00.000Z", active: true, ownerAgentId: "agent-1",
      },
    });
  });
  it("explains every problem in plain words", () => {
    const r = draftToInput(draft({ code: "a", value: "150", maxDiscountPercent: "-1", scope: "pages", pageIds: [], maxUses: "0", startsAt: "2026-10-10T00:00", endsAt: "2026-10-09T00:00" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({
      code: "Use 2 to 40 capital letters, numbers, - or _ with no spaces, like PZ10.",
      value: "Enter a whole percentage from 1 to 100.",
      maxDiscountPercent: "Enter a percentage from 0 to 100, or leave it empty.",
      pageIds: "Choose at least one page, or choose All pages.",
      maxUses: "Enter a whole number of 1 or more, or leave it empty.",
      endsAt: "The end must be after the start.",
    });
  });
  it("a fixed code needs at least one positive amount", () => {
    const empty = draftToInput(draft({ type: "fixed", fixedAmounts: {} }));
    expect(!empty.ok && empty.errors.fixedAmounts).toBe("Enter the discount for at least one currency, for example PKR 500.");
    const bad = draftToInput(draft({ type: "fixed", fixedAmounts: { PKR: "-5" } }));
    expect(!bad.ok && bad.errors.fixedAmounts).toBe("Enter an amount above 0 for PKR, or leave it empty.");
  });
  it("honours the schema's upper bounds", () => {
    const big = draftToInput(draft({ type: "fixed", fixedAmounts: { PKR: "10000001" } }));
    expect(!big.ok && big.errors.fixedAmounts).toMatch(/most you can take off in PKR is 10,000,000/);
    const many = draftToInput(draft({ maxUses: "1000001" }));
    expect(!many.ok && many.errors.maxUses).toMatch(/up to 1,000,000/);
  });
});

describe("draftFromPromo and patchFromInput", () => {
  it("loads a stored code into the form", () => {
    const d = draftFromPromo(promo({ type: "fixed", value: 0, fixedAmounts: { PKR: 500 }, pageIds: ["p1"], maxUses: 20, endsAt: "2026-10-15T18:59:00+00:00" }));
    expect(d).toMatchObject({ code: "PZ10", type: "fixed", value: "", fixedAmounts: { PKR: "500" }, scope: "pages", pageIds: ["p1"], maxUses: "20", endsAt: "2026-10-15T23:59", startsAt: "" });
  });
  it("a PATCH never renames the code or changes its owner", () => {
    const r = draftToInput(draft());
    if (!r.ok) throw new Error("invalid");
    const p = patchFromInput(r.input);
    expect(p).not.toHaveProperty("code");
    expect(p).not.toHaveProperty("ownerAgentId");
    expect(p).toMatchObject({ type: "percent", value: 10, active: true });
  });
});

describe("promoState and describeDiscount", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  it("works out the state a person would see", () => {
    expect(promoState(promo(), now)).toBe("active");
    expect(promoState(promo({ active: false }), now)).toBe("paused");
    expect(promoState(promo({ maxUses: 5, usedCount: 5 }), now)).toBe("used_up");
    expect(promoState(promo({ endsAt: "2026-10-01T00:00:00Z" }), now)).toBe("expired");
    expect(promoState(promo({ startsAt: "2026-11-01T00:00:00Z" }), now)).toBe("scheduled");
  });
  it("describes the discount", () => {
    expect(describeDiscount(promo())).toBe("10% off");
    expect(describeDiscount(promo({ value: 30, maxDiscountPercent: 20 }))).toBe("30% off (at most 20%)");
    expect(describeDiscount(promo({ type: "fixed", value: 0, fixedAmounts: { USD: 5, PKR: 1500 } }))).toBe("PKR 1,500 / USD 5 off");
  });
});

describe("optionChoices", () => {
  it("lists each option once, naming the pages it belongs to", () => {
    expect(optionChoices(PAGES, [])).toEqual([
      { key: "full", label: "Full Course · PPC Batch 3, MDC Batch 3" },
      { key: "m1", label: "Module 1 · PPC Batch 3" },
    ]);
    expect(optionChoices(PAGES, ["p2"])).toEqual([{ key: "full", label: "Full Workshop · MDC Batch 3" }]);
  });
});

describe("agentLinkUrl", () => {
  it("builds the public page link with the agent's ref code", () => {
    expect(agentLinkUrl("https://pz.academy", "ppc-b4", "ayesha-7k2")).toBe("https://pz.academy/e/ppc-b4?ref=ayesha-7k2");
    expect(agentLinkUrl("https://pz.academy/", "ppc-b4", "ayesha-7k2")).toBe("https://pz.academy/e/ppc-b4?ref=ayesha-7k2");
  });
});
