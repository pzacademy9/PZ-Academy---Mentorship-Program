// tests/landing-registration-pricing.test.ts
import { describe, it, expect } from "vitest";
import { computeQuote, isEarlyBird, resolveOptionKeys, availableOptions, type QuoteInput } from "@/lib/landing/registration/pricing";
import {
  ppcConfig, mdcConfig, w20Config, PPC_EB_ENDS, DURING_PPC_EB, AFTER_PPC_EB, DURING_MDC_EB, AFTER_MDC_EB,
} from "./fixtures/landing-registration";

const ppc = (p: Partial<QuoteInput> = {}) =>
  computeQuote({ config: ppcConfig(), regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, now: DURING_PPC_EB, ...p });
const mdc = (p: Partial<QuoteInput> = {}) =>
  computeQuote({ config: mdcConfig(), regionKey: "PK", mode: "live", optionKeys: ["workshop"], tierKey: "individual", groupSize: 1, now: DURING_MDC_EB, ...p });
const w20 = (p: Partial<QuoteInput> = {}) =>
  computeQuote({ config: w20Config(), regionKey: "PK", mode: "live", optionKeys: ["pro"], tierKey: "individual", groupSize: 1, now: AFTER_PPC_EB, ...p });

describe("isEarlyBird", () => {
  it("is an absolute instant: on until the millisecond before the cutoff, off at the cutoff", () => {
    const c = ppcConfig();
    const end = Date.parse(PPC_EB_ENDS);
    expect(isEarlyBird(c, new Date(end - 1))).toBe(true);
    expect(isEarlyBird(c, new Date(end))).toBe(false);
    expect(isEarlyBird(c, new Date(end + 1))).toBe(false);
  });
  it("is never on without a valid end date", () => {
    expect(isEarlyBird({ ...ppcConfig(), earlyBirdEndsAt: "" }, DURING_PPC_EB)).toBe(false);
    expect(isEarlyBird({ ...ppcConfig(), earlyBirdEndsAt: "soon" }, DURING_PPC_EB)).toBe(false);
  });
});

describe("PPC full course, Pakistan", () => {
  it("Early Bird individual is PKR 4,800 against a list price of 6,000", () => {
    expect(ppc()).toEqual({
      ok: true, currency: "PKR", regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1,
      earlyBirdApplied: true, isFree: false, listPerPerson: 6000, perPerson: 4800, total: 4800, savings: 1200,
    });
  });
  it("Early Bird group of 3 is the hand-set total 11,500 (3,833 each), not 11,520", () => {
    expect(ppc({ tierKey: "group3", groupSize: 3 })).toMatchObject({ ok: true, total: 11500, perPerson: 3833, savings: 6500 });
  });
  it("Early Bird group of 5 is 18,000 (3,600 each)", () => {
    expect(ppc({ tierKey: "group5", groupSize: 5 })).toMatchObject({ ok: true, total: 18000, perPerson: 3600 });
  });
  it("after Early Bird: 6,000 individual, 14,400 for 3 (the Early Bird total is not reused), 22,500 for 5", () => {
    expect(ppc({ now: AFTER_PPC_EB })).toMatchObject({ ok: true, total: 6000, earlyBirdApplied: false, savings: 0 });
    expect(ppc({ now: AFTER_PPC_EB, tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 14400, perPerson: 4800, savings: 3600 });
    expect(ppc({ now: AFTER_PPC_EB, tierKey: "group5", groupSize: 5 })).toMatchObject({ total: 22500, perPerson: 4500 });
  });
  it("switches to the regular price exactly at the cutoff instant", () => {
    expect(ppc({ now: new Date(Date.parse(PPC_EB_ENDS) - 1) })).toMatchObject({ total: 4800 });
    expect(ppc({ now: new Date(PPC_EB_ENDS) })).toMatchObject({ total: 6000 });
  });
  it("recorded is 85% of the regular price, ignores Early Bird: 5,100; group of 3 = 12,240", () => {
    expect(ppc({ mode: "recorded" })).toMatchObject({ ok: true, total: 5100, listPerPerson: 5100, earlyBirdApplied: false, savings: 0 });
    expect(ppc({ mode: "recorded", tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 12240, perPerson: 4080 });
    expect(ppc({ mode: "recorded", tierKey: "group5", groupSize: 5 })).toMatchObject({ total: 19125, perPerson: 3825 });
  });
});

describe("PPC modules", () => {
  it("two Early Bird modules cost 1,600 x 2 = 3,200, listed against 4,000", () => {
    expect(ppc({ optionKeys: ["m3", "m1"] })).toMatchObject({ ok: true, optionKeys: ["m1", "m3"], total: 3200, listPerPerson: 4000, savings: 800 });
  });
  it("two modules in a group of 3 use the percentage, never a single-option total: 7,680", () => {
    expect(ppc({ optionKeys: ["m1", "m3"], tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 7680, perPerson: 2560 });
  });
  it("one module in a group of 3 during Early Bird is 3,840", () => {
    expect(ppc({ optionKeys: ["m2"], tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 3840, perPerson: 1280 });
  });
  it("choosing all four modules collapses to the Full Course price", () => {
    expect(ppc({ optionKeys: ["m1", "m2", "m3", "m4"] })).toMatchObject({ ok: true, optionKeys: ["full"], total: 4800 });
    expect(ppc({ optionKeys: ["m4", "m2", "m1", "m3"], tierKey: "group3", groupSize: 3 })).toMatchObject({ optionKeys: ["full"], total: 11500 });
  });
  it("Full Course plus a module is just the Full Course", () => {
    expect(ppc({ optionKeys: ["full", "m2"] })).toMatchObject({ optionKeys: ["full"], total: 4800 });
  });
});

describe("PPC International (USD) hand-set totals", () => {
  it("Early Bird: 44 individual, 105 for 3 (computed), 164 for 5 (hand-set, 33 each)", () => {
    expect(ppc({ regionKey: "INTL" })).toMatchObject({ currency: "USD", total: 44 });
    expect(ppc({ regionKey: "INTL", tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 105, perPerson: 35 });
    expect(ppc({ regionKey: "INTL", tierKey: "group5", groupSize: 5 })).toMatchObject({ total: 164, perPerson: 33 });
  });
  it("after Early Bird: 55 individual, 131 for 3 (44 each), 204 for 5 (41 each)", () => {
    expect(ppc({ regionKey: "INTL", now: AFTER_PPC_EB })).toMatchObject({ total: 55 });
    expect(ppc({ regionKey: "INTL", now: AFTER_PPC_EB, tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 131, perPerson: 44 });
    expect(ppc({ regionKey: "INTL", now: AFTER_PPC_EB, tierKey: "group5", groupSize: 5 })).toMatchObject({ total: 204, perPerson: 41 });
  });
  it("one module, Early Bird group of 3 is the hand-set 38 (13 each); after Early Bird it is computed 48", () => {
    expect(ppc({ regionKey: "INTL", optionKeys: ["m1"], tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 38, perPerson: 13 });
    expect(ppc({ regionKey: "INTL", optionKeys: ["m1"], now: AFTER_PPC_EB, tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 48, perPerson: 16 });
  });
  it("recorded never uses hand-set totals: round(55 x 0.85) = 47, group of 3 = 38 x 3 = 114", () => {
    expect(ppc({ regionKey: "INTL", mode: "recorded", tierKey: "group3", groupSize: 3 })).toMatchObject({ total: 114, perPerson: 38 });
  });
});

describe("MDC workshop (variable-size group, 20% off)", () => {
  it("Early Bird: 2,700 individual (saves 800), 2,160 per person in a group", () => {
    expect(mdc()).toMatchObject({ ok: true, total: 2700, savings: 800, earlyBirdApplied: true });
    expect(mdc({ tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 2160, total: 6480, savings: 4020 });
  });
  it("after Early Bird: 3,500 individual, 2,800 per person in a group of 4", () => {
    expect(mdc({ now: AFTER_MDC_EB })).toMatchObject({ total: 3500, earlyBirdApplied: false });
    expect(mdc({ now: AFTER_MDC_EB, tierKey: "group", groupSize: 4 })).toMatchObject({ perPerson: 2800, total: 11200, savings: 2800 });
  });
  it("recorded: 2,975 individual, 2,380 per person in a group", () => {
    expect(mdc({ mode: "recorded" })).toMatchObject({ total: 2975 });
    expect(mdc({ mode: "recorded", tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 2380, total: 7140 });
  });
  it("accepts any group size from 3 to 50", () => {
    expect(mdc({ tierKey: "group", groupSize: 50 })).toMatchObject({ ok: true, total: 2160 * 50 });
    expect(mdc({ tierKey: "group", groupSize: 51 })).toEqual({ ok: false, reason: "bad_group_size" });
    expect(mdc({ tierKey: "group", groupSize: 2 })).toEqual({ ok: false, reason: "bad_group_size" });
  });
});

describe("Webinar 20 (free and pro)", () => {
  it("Pro is PKR 399; a group of 4 pays 319 each = 1,276", () => {
    expect(w20()).toMatchObject({ ok: true, currency: "PKR", total: 399, isFree: false, earlyBirdApplied: false });
    expect(w20({ tierKey: "group", groupSize: 4 })).toMatchObject({ perPerson: 319, total: 1276, savings: 320 });
  });
  it("Philippines Pro is PHP 150, group 120 each", () => {
    expect(w20({ regionKey: "PH" })).toMatchObject({ currency: "PHP", total: 150 });
    expect(w20({ regionKey: "PH", tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 120, total: 360 });
  });
  it("Free costs nothing and is marked free", () => {
    expect(w20({ optionKeys: ["free"] })).toEqual({
      ok: true, currency: "PKR", regionKey: "PK", mode: "live", optionKeys: ["free"], tierKey: "individual", groupSize: 1,
      earlyBirdApplied: false, isFree: true, listPerPerson: 0, perPerson: 0, total: 0, savings: 0,
    });
  });
});

describe("every way a quote can fail", () => {
  it("no_region", () => expect(ppc({ regionKey: "XX" })).toEqual({ ok: false, reason: "no_region" }));
  it("mode_not_offered", () => expect(w20({ mode: "recorded" })).toEqual({ ok: false, reason: "mode_not_offered" }));
  it("no_option for an empty or unknown selection", () => {
    expect(ppc({ optionKeys: [] })).toEqual({ ok: false, reason: "no_option" });
    expect(ppc({ optionKeys: ["full", "nope"] })).toEqual({ ok: false, reason: "no_option" });
  });
  it("mixed_free when free and paid are combined", () => expect(w20({ optionKeys: ["free", "pro"] })).toEqual({ ok: false, reason: "mixed_free" }));
  it("bad_tier for an unknown tier", () => expect(ppc({ tierKey: "group9", groupSize: 9 })).toEqual({ ok: false, reason: "bad_tier" }));
  it("bad_group_size for sizes that do not fit the tier", () => {
    for (const p of [
      { tierKey: "individual", groupSize: 2 },
      { tierKey: "group3", groupSize: 4 },
      { tierKey: "group3", groupSize: 2 },
      { tierKey: "individual", groupSize: 0 },
      { tierKey: "group5", groupSize: 4.5 },
    ]) expect(ppc(p), JSON.stringify(p)).toEqual({ ok: false, reason: "bad_group_size" });
  });
  it("no_price when the option has no price in that country (W20 Free in the Philippines)", () => {
    expect(w20({ regionKey: "PH", optionKeys: ["free"] })).toEqual({ ok: false, reason: "no_price" });
    const c = ppcConfig();
    delete c.prices.m1.INTL;
    expect(computeQuote({ config: c, regionKey: "INTL", mode: "live", optionKeys: ["m1"], tierKey: "individual", groupSize: 1, now: DURING_PPC_EB }))
      .toEqual({ ok: false, reason: "no_price" });
  });
  it("free_group: a free plan cannot be bought as a group", () => {
    expect(w20({ optionKeys: ["free"], tierKey: "group", groupSize: 3 })).toEqual({ ok: false, reason: "free_group" });
  });
});

describe("resolveOptionKeys and availableOptions", () => {
  it("drops unknown keys and duplicates, keeps config order", () => {
    expect(resolveOptionKeys(ppcConfig(), ["m3", "x", "m1", "m3"])).toEqual(["m1", "m3"]);
  });
  it("does not collapse when module mix is off", () => {
    const c = ppcConfig();
    c.moduleMix.enabled = false;
    expect(resolveOptionKeys(c, ["m1", "m2", "m3", "m4"])).toEqual(["m1", "m2", "m3", "m4"]);
  });
  it("lists only options priced in the country", () => {
    expect(availableOptions(w20Config(), "PK").map((o) => o.key)).toEqual(["free", "pro"]);
    expect(availableOptions(w20Config(), "PH").map((o) => o.key)).toEqual(["pro"]);
    expect(availableOptions(w20Config(), "XX")).toEqual([]);
  });
});

describe("inherited property names never leak into a quote", () => {
  const sane = (r: ReturnType<typeof computeQuote>) => {
    if (!r.ok) return true;
    return [r.total, r.perPerson, r.listPerPerson, r.savings].every((n) => Number.isSafeInteger(n));
  };
  it("an option keyed 'constructor' with no price is no_price, never NaN or a throw", () => {
    const c = ppcConfig();
    c.options.push({ key: "constructor", label: "X", kind: "module", free: false, waGroupUrl: "", moduleIds: [] });
    const r = computeQuote({ config: c, regionKey: "PK", mode: "live", optionKeys: ["constructor"], tierKey: "individual", groupSize: 1, now: DURING_PPC_EB });
    expect(r).toEqual({ ok: false, reason: "no_price" });
    expect(availableOptions(c, "PK").map((o) => o.key)).not.toContain("constructor");
  });
  it("a tier keyed 'toString' falls back to the percentage when no explicit total is set", () => {
    const c = ppcConfig();
    c.tiers.push({ key: "toString", label: "T", minSize: 3, maxSize: 3, percentOff: 20 });
    const r = computeQuote({ config: c, regionKey: "PK", mode: "live", optionKeys: ["m2"], tierKey: "toString", groupSize: 3, now: AFTER_PPC_EB });
    expect(r).toMatchObject({ ok: true, perPerson: 1600, total: 4800 });
    expect(sane(r)).toBe(true);
  });
  it("an inherited region key on the prices map is no_price, not a crash", () => {
    const c = ppcConfig();
    c.regions.push({ key: "constructor", label: "C", currency: "USD", classTime: "", timezoneLabel: "", accountKeys: [] });
    const r = computeQuote({ config: c, regionKey: "constructor", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, now: DURING_PPC_EB });
    expect(r).toEqual({ ok: false, reason: "no_price" });
  });
  it("non-integer or non-finite configured amounts never produce a NaN/fractional quote", () => {
    const c = ppcConfig();
    c.prices.full.PK = { amount: 100.5 };
    const r = computeQuote({ config: c, regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, now: AFTER_PPC_EB });
    expect(r.ok ? sane(r) : true).toBe(true);
    c.prices.full.PK = { amount: Number.NaN };
    const r2 = computeQuote({ config: c, regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, now: AFTER_PPC_EB });
    expect(r2.ok).toBe(false);
  });
});
