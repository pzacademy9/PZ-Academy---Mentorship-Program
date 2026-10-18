import { describe, expect, it } from "vitest";
import { DEFAULT_REGISTRATION, type RegistrationConfig } from "@/lib/landing/registration/config";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { formatMoney } from "@/lib/landing/registration/format";
import { LINK_ALL_MODULES, LINK_GROUP, cardPrice, priceLinkChoices } from "@/lib/landing/registration/card-price";

const before = new Date("2026-09-20T10:00:00+05:00");
const after = new Date("2026-09-25T10:00:00+05:00");

function cfg(over: Partial<RegistrationConfig> = {}): RegistrationConfig {
  const mod = (pk: number, uae: number) => ({ PK: { amount: pk }, UAE: { amount: uae } });
  return {
    ...DEFAULT_REGISTRATION,
    enabled: true,
    modes: ["live", "recorded"],
    recordedPercentOfRegular: 85,
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
      { key: "UAE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
    ],
    defaultRegionKey: "PK",
    options: [
      { key: "full", label: "Complete course", kind: "bundle", free: false, waGroupUrl: "" },
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "" },
      { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: "" },
      { key: "m3", label: "Module 3", kind: "module", free: false, waGroupUrl: "" },
      { key: "m4", label: "Module 4", kind: "module", free: false, waGroupUrl: "" },
    ],
    moduleMix: { enabled: true, bundleOptionKey: "full" },
    tiers: [{ key: "g3", label: "Group", minSize: 3, maxSize: 50, percentOff: 20 }],
    prices: {
      full: { PK: { amount: 4000, earlyAmount: 3200 }, UAE: { amount: 180, earlyAmount: 150 } },
      m1: mod(1200, 50), m2: mod(1200, 50), m3: mod(1200, 50), m4: mod(1200, 50),
    },
    earlyBirdEndsAt: "2026-09-24T23:59:00+05:00",
    ...over,
  };
}

describe("cardPrice", () => {
  it("(a) early bird price, strike, date, recorded; matches computeQuote", () => {
    const c = cfg();
    const p = cardPrice(c, "full", "PK", before);
    expect(p).toMatchObject({ kind: "price", current: "PKR 3,200", strike: "PKR 4,000", earlyEnds: "24 September 2026", recorded: "PKR 3,400", suffix: null });
    const q = computeQuote({ config: c, regionKey: "PK", optionKeys: ["full"], mode: "live", tierKey: "individual", groupSize: 1, now: before });
    expect(q.ok && p?.kind === "price" && p.current === formatMoney(q.perPerson, "PKR")).toBe(true);
  });

  it("(b) after the cut-off", () => {
    expect(cardPrice(cfg(), "full", "PK", after)).toMatchObject({ current: "PKR 4,000", strike: null, earlyEnds: null });
  });

  it("(c) group lines", () => {
    expect(cardPrice(cfg(), "full", "PK", before)).toMatchObject({ groupLines: ["Group of 3 or more: 20% off · PKR 2,560 each"] });
    expect(cardPrice(cfg(), "full", "PK", after)).toMatchObject({ groupLines: ["Group of 3 or more: 20% off · PKR 3,200 each"] });
  });

  it("(d) all modules: per module, or from", () => {
    expect(cardPrice(cfg(), LINK_ALL_MODULES, "PK", before)).toMatchObject({ current: "PKR 1,200", suffix: "per module" });
    const c = cfg();
    c.prices.m3 = { PK: { amount: 900 }, UAE: { amount: 50 } };
    expect(cardPrice(c, LINK_ALL_MODULES, "PK", before)).toMatchObject({ current: "PKR 900", suffix: "from" });
  });

  it("(d) all modules on a one-module link shows the plain price", () => {
    const c = cfg({ options: cfg().options.filter((o) => o.key === "m2"), moduleMix: { enabled: false, bundleOptionKey: "" } });
    expect(cardPrice(c, LINK_ALL_MODULES, "PK", before)).toMatchObject({ current: "PKR 1,200", suffix: null });
  });

  it("(e) group card", () => {
    expect(cardPrice(cfg(), LINK_GROUP, "PK", before)).toEqual({ kind: "group", lines: ["Group of 3 or more: 20% off · PKR 2,560 each"] });
    const noBundle = cfg({ moduleMix: { enabled: false, bundleOptionKey: "" } });
    expect(cardPrice(noBundle, LINK_GROUP, "PK", before)).toEqual({ kind: "group", lines: ["Group of 3 or more: 20% off · PKR 2,560 each"] });
    const none = cfg();
    delete none.prices.full;
    expect(cardPrice(none, LINK_GROUP, "PK", before)).toEqual({ kind: "group", lines: ["Group of 3 or more: 20% off"] });
    expect(cardPrice(cfg({ tiers: [] }), LINK_GROUP, "PK", before)).toBeNull();
  });

  it("(f) null cases", () => {
    const c = cfg();
    expect(cardPrice(c, "nope", "PK", before)).toBeNull();
    expect(cardPrice(c, "constructor", "PK", before)).toBeNull();
    expect(cardPrice(c, "__proto__", "PK", before)).toBeNull();
    c.prices.m1 = { PK: { amount: 1 } };
    expect(cardPrice(c, "m1", "UAE", before)).toBeNull();
    expect(cardPrice(cfg(), "full", "XX", before)).toBeNull();
    expect(cardPrice(cfg({ regions: [] }), "full", "PK", before)).toBeNull();
  });

  it("(g) free option", () => {
    const c = cfg();
    c.options.push({ key: "wk", label: "Workshop", kind: "bundle", free: true, waGroupUrl: "" });
    c.prices.wk = { PK: { amount: 0 } };
    expect(cardPrice(c, "wk", "PK", before)).toMatchObject({ current: "Free", strike: null, recorded: null, groupLines: [] });
  });

  it("(h) recorded only", () => {
    const p = cardPrice(cfg({ modes: ["recorded"] }), "full", "PK", before);
    expect(p).toMatchObject({ current: "PKR 3,400", strike: null, earlyEnds: null, recorded: null });
  });
});

describe("priceLinkChoices", () => {
  it("(i) options, then extras only when they apply", () => {
    expect(priceLinkChoices(cfg()).map((x) => x.value)).toEqual(["full", "m1", "m2", "m3", "m4", LINK_ALL_MODULES, LINK_GROUP]);
    expect(priceLinkChoices(cfg())[0]).toEqual({ value: "full", label: "Complete course" });
    expect(priceLinkChoices(cfg()).slice(-2).map((x) => x.label)).toEqual(["All single modules", "Group discount"]);
    const bare = cfg({ options: [cfg().options[0]], tiers: [] });
    expect(priceLinkChoices(bare).map((x) => x.value)).toEqual(["full"]);
  });
});
