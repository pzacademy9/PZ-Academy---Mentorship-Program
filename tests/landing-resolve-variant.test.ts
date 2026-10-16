import { describe, it, expect } from "vitest";
import { resolveVariant, findOrphans } from "@/lib/landing/resolve-variant";
import { emptyOverrides, defaultModuleHeadline, type VariantOverrides } from "@/lib/landing/variants";
import { emptyContent, type LandingContent } from "@/lib/landing/content";

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

function build(): LandingContent {
  const c = emptyContent("course");
  c.sections = [
    { id: "hero1", type: "hero", enabled: true, data: { headline: "Main headline", subheadline: "Main sub" } },
    { id: "cur1", type: "curriculum", enabled: true, data: { heading: "Learn", items: [
      { title: "Intro", subtitle: "", points: "", module: "" },
      { title: "M1 topic", subtitle: "", points: "", module: "module-1" },
      { title: "M2 topic", subtitle: "", points: "", module: "module-2" },
    ] } },
    { id: "sch1", type: "schedule", enabled: true, data: { heading: "Schedule", items: [
      { when: "Mon", title: "Welcome", detail: "", module: "" },
      { when: "Tue", title: "M1 class", detail: "", module: "module-1" },
      { when: "Wed", title: "M2 class", detail: "", module: "module-2" },
    ] } },
    { id: "price1", type: "pricing_cards", enabled: true, data: { heading: "Plans", note: "", items: [
      { name: "Bundle", price: "PKR 9000", oldPrice: "", badge: "", features: "", module: "" },
      { name: "M1 fee", price: "PKR 3000", oldPrice: "", badge: "", features: "", module: "module-1" },
      { name: "M2 fee", price: "PKR 4000", oldPrice: "", badge: "", features: "", module: "module-2" },
    ] } },
    { id: "faq1", type: "faq", enabled: true, data: { heading: "FAQ", items: [
      { q: "General?", a: "yes", module: "" },
      { q: "M1 only?", a: "yes", module: "module-1" },
    ] } },
    { id: "only1", type: "faq", enabled: true, data: { heading: "M1 FAQ", items: [{ q: "x", a: "y", module: "module-1" }] } },
  ];
  c.modules = [
    { key: "module-1", title: "One", format: "3-Day Workshop", days: 3, optionKey: "m1" },
    { key: "module-2", title: "Two", format: "3-Day Workshop", days: 3, optionKey: "m2" },
  ];
  const cell = (amount: number, totals?: Record<string, number>) => ({ amount, ...(totals ? { groupTotals: totals } : {}) });
  c.registration = {
    ...c.registration,
    enabled: true,
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7pm", timezoneLabel: "PKT", accountKeys: ["a"] },
      { key: "UAE", label: "UAE", currency: "AED", classTime: "6pm", timezoneLabel: "GST", accountKeys: ["b"] },
    ],
    defaultRegionKey: "PK",
    options: [
      { key: "bundle", label: "Bundle", kind: "bundle", free: false, waGroupUrl: "" },
      { key: "m1", label: "M1", kind: "module", free: false, waGroupUrl: "" },
      { key: "m2", label: "M2", kind: "module", free: false, waGroupUrl: "" },
      { key: "pkonly", label: "PK only", kind: "bundle", free: false, waGroupUrl: "" },
    ],
    moduleMix: { enabled: true, bundleOptionKey: "bundle" },
    tiers: [
      { key: "duo", label: "Duo", minSize: 2, maxSize: 2, percentOff: 10 },
      { key: "trio", label: "Trio", minSize: 3, maxSize: 3, percentOff: 15 },
    ],
    prices: {
      bundle: { PK: cell(9000, { duo: 17000 }), UAE: cell(100) },
      m1: { PK: cell(3000), UAE: cell(40) },
      m2: { PK: cell(4000, { trio: 11000 }), UAE: cell(50) },
      pkonly: { PK: cell(1) },
    },
  };
  return c;
}

const ids = (c: LandingContent) => c.sections.map((s) => s.id);
const sec = (c: LandingContent, id: string) => c.sections.find((s) => s.id === id)!;
const items = (c: LandingContent, id: string) => (sec(c, id).data.items as Record<string, unknown>[]);
const M2 = { regionKey: null, moduleKey: "module-2" };
const MAIN = { regionKey: null, moduleKey: null };

describe("resolveVariant", () => {
  it("override replaces headline and subheadline follows main", () => {
    const o: VariantOverrides = { sections: { hero1: { fields: { headline: "Custom" } } } };
    const main = build();
    expect(sec(resolveVariant(main, MAIN, o), "hero1").data.headline).toBe("Custom");
    main.sections[0].data.subheadline = "Changed sub";
    const r = resolveVariant(main, MAIN, o);
    expect(sec(r, "hero1").data.subheadline).toBe("Changed sub");
    expect(sec(r, "hero1").data.headline).toBe("Custom");
  });
  it("hidden disables a section", () => {
    const r = resolveVariant(build(), MAIN, { sections: { faq1: { hidden: true } } });
    expect(sec(r, "faq1").enabled).toBe(false);
  });
  it("ignores unknown section ids and unknown field keys", () => {
    const o: VariantOverrides = { sections: { nope: { fields: { a: 1 }, hidden: true }, hero1: { fields: { bogus: "x" } } } };
    expect(resolveVariant(build(), MAIN, o)).toEqual(build());
  });
  it("honors order, dropping unknown ids and keeping the rest at the end", () => {
    const r = resolveVariant(build(), MAIN, { sections: {}, order: ["faq1", "ghost", "hero1"] });
    expect(ids(r)).toEqual(["faq1", "hero1", "cur1", "sch1", "price1", "only1"]);
  });
  it("shallow-merges settings and seo", () => {
    const r = resolveVariant(build(), MAIN, { sections: {}, settings: { registerLabel: "Join" }, seo: { title: "T" } });
    expect(r.settings.registerLabel).toBe("Join");
    expect(r.settings.whatsappNumber).toBe(build().settings.whatsappNumber);
    expect(r.seo.title).toBe("T");
  });
  it("filters curriculum to module-2 plus untagged items", () => {
    const r = resolveVariant(build(), M2, emptyOverrides());
    expect(items(r, "cur1").map((i) => i.title)).toEqual(["Intro", "M2 topic"]);
  });
  it("filters schedule", () => {
    const r = resolveVariant(build(), M2, emptyOverrides());
    expect(items(r, "sch1").map((i) => i.title)).toEqual(["Welcome", "M2 class"]);
  });
  it("drops price cards of other modules", () => {
    const r = resolveVariant(build(), M2, emptyOverrides());
    expect(items(r, "price1").map((i) => i.name)).toEqual(["Bundle", "M2 fee"]);
  });
  it("drops FAQ items tagged for another module", () => {
    const r = resolveVariant(build(), M2, emptyOverrides());
    expect(items(r, "faq1").map((i) => i.q)).toEqual(["General?"]);
  });
  it("disables a section whose items are all removed", () => {
    const r = resolveVariant(build(), M2, emptyOverrides());
    expect(items(r, "only1")).toEqual([]);
    expect(sec(r, "only1").enabled).toBe(false);
    expect(sec(r, "faq1").enabled).toBe(true);
  });
  it("region UAE leaves one region and only UAE prices", () => {
    const r = resolveVariant(build(), { regionKey: "UAE", moduleKey: null }, emptyOverrides()).registration;
    expect(r.regions.map((g) => g.key)).toEqual(["UAE"]);
    expect(r.defaultRegionKey).toBe("UAE");
    for (const row of Object.values(r.prices)) expect(Object.keys(row)).toEqual(["UAE"]);
    expect(r.options.map((o) => o.key)).not.toContain("pkonly");
    expect(r.prices.pkonly).toBeUndefined();
    expect(r.enabled).toBe(true);
  });
  it("module-2 leaves exactly its option and no bundle", () => {
    const r = resolveVariant(build(), M2, emptyOverrides());
    expect(r.registration.options.map((o) => o.key)).toEqual(["m2"]);
    expect(Object.keys(r.registration.prices)).toEqual(["m2"]);
    expect(r.registration.moduleMix.enabled).toBe(false);
    expect(r.registration.tiers.map((t) => t.key)).toEqual(["trio"]);
    expect(r.modules.map((m) => m.key)).toEqual(["module-2"]);
  });
  it("module with empty or unknown optionKey disables registration", () => {
    const a = build();
    a.modules[1].optionKey = "";
    expect(resolveVariant(a, M2, emptyOverrides()).registration.enabled).toBe(false);
    const b = build();
    b.modules[1].optionKey = "zzz";
    expect(resolveVariant(b, M2, emptyOverrides()).registration.enabled).toBe(false);
  });
  it("UAE + module-2 combines", () => {
    const r = resolveVariant(build(), { regionKey: "UAE", moduleKey: "module-2" }, emptyOverrides()).registration;
    expect(r.regions.map((g) => g.key)).toEqual(["UAE"]);
    expect(r.options.map((o) => o.key)).toEqual(["m2"]);
    expect(r.prices).toEqual({ m2: { UAE: { amount: 50 } } });
  });
  it("main with empty overrides deep-equals input", () => {
    expect(resolveVariant(build(), MAIN, emptyOverrides())).toEqual(build());
  });
  it("does not mutate inputs", () => {
    const main = deepFreeze(build());
    const o = deepFreeze<VariantOverrides>({ sections: { hero1: { fields: { headline: "H" }, hidden: true } }, order: ["faq1"], settings: { registerLabel: "x" }, seo: { title: "t" } });
    expect(() => resolveVariant(main, { regionKey: "UAE", moduleKey: "module-2" }, o)).not.toThrow();
  });
});

describe("findOrphans / defaultModuleHeadline", () => {
  it("reports deleted sections and removed field keys", () => {
    const o: VariantOverrides = { sections: { gone: { hidden: true }, hero1: { fields: { headline: "x", oldField: "y" } } } };
    expect(findOrphans(build(), o)).toEqual({ sectionIds: ["gone"], fields: [{ sectionId: "hero1", field: "oldField" }] });
  });
  it("default headline", () => {
    expect(defaultModuleHeadline(build().modules[0])).toBe("3-Day Workshop: One");
  });
});
