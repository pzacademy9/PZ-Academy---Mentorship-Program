// tests/landing-registration-admin-edit.test.ts
import { describe, it, expect } from "vitest";
import {
  addOption, removeOption, addRegion, removeRegion, copyPriceRow, setPriceCell, setGroupTotal, removeTier,
  localToOffsetIso, offsetIsoToLocal, REGION_PRESETS, TIER_PRESETS, addTier,
} from "@/lib/landing/registration/admin-edit";
import { REG_STEPS, parseRegistrationTarget, registrationTarget } from "@/lib/landing/registration/setup-steps";
import { registrationProblems, type RegistrationConfig } from "@/lib/landing/registration/config";
import { computeReadiness, emptyContent, updateRegistration } from "@/lib/landing/content";
import { ppcConfig } from "./fixtures/registration-fixtures";

const clone = (r: RegistrationConfig): RegistrationConfig => JSON.parse(JSON.stringify(r));

describe("admin-edit operations", () => {
  it("copyPriceRow copies every option's cell into the target country as an independent copy", () => {
    const next = copyPriceRow(ppcConfig, "UAE", "KSA");
    expect(next.prices.full.KSA).toEqual(ppcConfig.prices.full.UAE);
    expect(next.prices.m1.KSA).toEqual(ppcConfig.prices.m1.UAE);
    next.prices.full.KSA.amount = 1;
    expect(next.prices.full.UAE.amount).toBe(200);
    expect(ppcConfig.prices.full.KSA.amount).toBe(200);
  });
  it("copyPriceRow removes target cells the source does not have", () => {
    const r = setPriceCell(ppcConfig, "m2", "UAE", null);
    expect(copyPriceRow(r, "UAE", "KSA").prices.m2.KSA).toBeUndefined();
  });
  it("setPriceCell with null removes the cell; with a cell it replaces it", () => {
    expect(setPriceCell(ppcConfig, "full", "PK", null).prices.full.PK).toBeUndefined();
    expect(setPriceCell(ppcConfig, "full", "PK", { amount: 7000 }).prices.full.PK).toEqual({ amount: 7000 });
  });
  it("setGroupTotal sets and clears an exact total for one tier", () => {
    const a = setGroupTotal(ppcConfig, "full", "PK", "group3", 11500);
    expect(a.prices.full.PK.groupTotals).toEqual({ group3: 11500 });
    const b = setGroupTotal(a, "full", "PK", "group3", null);
    expect(b.prices.full.PK.groupTotals).toBeUndefined();
    const c = setGroupTotal(ppcConfig, "full", "PK", "group3", 11500, true);
    expect(c.prices.full.PK.earlyGroupTotals).toEqual({ group3: 11500 });
    expect(c.prices.full.PK.groupTotals).toBeUndefined();
    expect(setGroupTotal(c, "full", "PK", "group3", 14400).prices.full.PK).toMatchObject({ earlyGroupTotals: { group3: 11500 }, groupTotals: { group3: 14400 } });
  });
  it("addOption makes unique keys from the label", () => {
    const a = addOption(ppcConfig, "module", "Module 1");
    const b = addOption(a, "module", "Module 1");
    const keys = b.options.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("module_1");
    expect(keys).toContain("module_1_2");
  });
  it("removeOption drops its prices and resets the module-mix package when it was the package", () => {
    const next = removeOption(ppcConfig, "full");
    expect(next.prices.full).toBeUndefined();
    expect(next.moduleMix).toEqual({ enabled: false, bundleOptionKey: "" });
  });
  it("addRegion ignores a duplicate key and removeRegion drops its prices and fixes the default", () => {
    expect(addRegion(ppcConfig, REGION_PRESETS.find((p) => p.key === "PK")!).regions).toHaveLength(4);
    const next = removeRegion(ppcConfig, "PK");
    expect(next.regions.map((r) => r.key)).toEqual(["UAE", "KSA", "INTL"]);
    expect(next.prices.full.PK).toBeUndefined();
    expect(next.defaultRegionKey).toBe("UAE");
  });
  it("removeTier strips that tier's exact group totals", () => {
    const a = setGroupTotal(setGroupTotal(ppcConfig, "full", "PK", "group3", 11500), "full", "PK", "group3", 11000, true);
    expect(removeTier(a, "group3").prices.full.PK.groupTotals).toBeUndefined();
    expect(removeTier(a, "group3").prices.full.PK.earlyGroupTotals).toBeUndefined();
    expect(removeTier(a, "group3").tiers.map((t) => t.key)).toEqual(["group5"]);
  });
  it("addTier from a preset ignores an existing key", () => {
    expect(addTier(ppcConfig, TIER_PRESETS[0]).tiers).toHaveLength(2);
  });
});

describe("Early Bird time helpers", () => {
  it("joins a datetime-local value and an offset into an ISO instant with that offset", () => {
    expect(localToOffsetIso("2026-10-15T23:59", "+05:00")).toBe("2026-10-15T23:59:00+05:00");
    expect(Date.parse(localToOffsetIso("2026-10-15T23:59", "+05:00"))).toBe(Date.parse("2026-10-15T18:59:00Z"));
    expect(localToOffsetIso("", "+05:00")).toBe("");
    expect(localToOffsetIso("15/10/2026", "+05:00")).toBe("");
  });
  it("splits an ISO back into the local value and offset, treating Z as UTC and anything else as Pakistan time", () => {
    expect(offsetIsoToLocal("2026-10-15T23:59:00+05:00")).toEqual({ local: "2026-10-15T23:59", offset: "+05:00" });
    expect(offsetIsoToLocal("2026-10-15T19:00:00Z")).toEqual({ local: "2026-10-15T19:00", offset: "+00:00" });
    expect(offsetIsoToLocal("2026-10-15T19:00:00.000Z")).toEqual({ local: "2026-10-15T19:00", offset: "+00:00" });
    expect(offsetIsoToLocal("")).toEqual({ local: "", offset: "+05:00" });
    expect(offsetIsoToLocal("not a date")).toEqual({ local: "", offset: "+05:00" });
  });
});

describe("readiness targets", () => {
  it("round-trips every step through the target id and rejects others", () => {
    for (const s of REG_STEPS) expect(parseRegistrationTarget(registrationTarget(s.key))).toBe(s.key);
    expect(parseRegistrationTarget("registration:nope")).toBeNull();
    expect(parseRegistrationTarget("s1")).toBeNull();
  });
  it("the PPC fixture has no registration problems", () => {
    expect(registrationProblems(ppcConfig)).toEqual([]);
  });
  const faults: [string, (r: RegistrationConfig) => void, string][] = [
    ["no options", (r) => { r.options = []; r.prices = {}; r.moduleMix = { enabled: false, bundleOptionKey: "" }; }, "buy"],
    ["no modes", (r) => { r.modes = []; }, "buy"],
    ["a tier with min above max", (r) => { r.tiers[0] = { ...r.tiers[0], minSize: 6, maxSize: 3 }; }, "groups"],
    ["a missing price", (r) => { delete r.prices.full.KSA; }, "prices"],
    ["no countries", (r) => { r.regions = []; r.defaultRegionKey = ""; }, "prices"],
    ["an Early Bird price above the regular price", (r) => { r.prices.full.PK.earlyAmount = 9000; }, "prices"],
    ["an unparseable Early Bird end", (r) => { r.earlyBirdEndsAt = "soon"; }, "earlybird"],
    ["a country with a malformed payment account code", (r) => { r.regions[2] = { ...r.regions[2], accountKeys: ["Bad Key"] }; }, "accounts"],
    ["a bad WhatsApp group link", (r) => { r.options[1] = { ...r.options[1], waGroupUrl: "https://example.com/x" }; }, "whatsapp"],
    ["a bad reference prefix", (r) => { r.refPrefix = "p p"; }, "details"],
  ];
  for (const [name, mutate, step] of faults) {
    it(`tags "${name}" with the "${step}" step`, () => {
      const r = clone(ppcConfig);
      mutate(r);
      const problems = registrationProblems(r);
      expect(problems.length).toBeGreaterThan(0);
      for (const p of problems) expect(p.step).toBe(step);
    });
  }
  it("computeReadiness points registration problems at the registration step", () => {
    const r = clone(ppcConfig);
    r.regions[2] = { ...r.regions[2], accountKeys: ["Bad Key"] };
    const c = updateRegistration(emptyContent("course"), r);
    const { problems } = computeReadiness(c, { title: "PPC", slug: "ppc-b3" });
    expect(problems.some((p) => p.sectionId === "registration:accounts")).toBe(true);
  });
  it("a disabled registration adds no registration problems", () => {
    const c = updateRegistration(emptyContent("course"), { ...clone(ppcConfig), enabled: false, regions: [] });
    expect(computeReadiness(c, { title: "PPC", slug: "ppc-b3" }).problems.some((p) => p.sectionId?.startsWith("registration:"))).toBe(false);
  });
});

describe("added option codes are valid (fix round 1)", () => {
  it("a package, a module and a second module added in the stepper raise no option-code problem", () => {
    let r = addOption(ppcConfig, "bundle", "New package");
    r = addOption(r, "module", "New module");
    r = addOption(r, "module", "New module");
    expect(r.options.slice(3).map((o) => o.key)).toEqual(["new_package", "new_module", "new_module_2"]);
    expect(registrationProblems(r).filter((p) => /option code/i.test(p.message))).toEqual([]);
  });
  it("an all-symbol label and a reserved word still give a valid code", () => {
    const r = addOption(addOption(ppcConfig, "module", "!!!"), "module", "constructor");
    expect(r.options.slice(3).map((o) => o.key)).toEqual(["option", "constructor_option"]);
    expect(registrationProblems(r).filter((p) => /option code|reserved/i.test(p.message))).toEqual([]);
  });
});
