import { describe, it, expect } from "vitest";
import { buildRegistration } from "@/lib/landing/import/build-registration";

const base = () => ({
  registration: {
    modes: ["live", "recorded"],
    recorded_percent: 60,
    default_region: "UAE",
    early_bird_ends: "2026-10-25T23:59:00+04:00",
    capacity: 0,
    verify_whatsapp: "923700199429",
    event_label: "PPC Batch 3",
    ref_prefix: "PPC",
    professions: ["Pharmacist", "Doctor"],
    discovery: ["Instagram"],
    regions: [{ code: "UAE", name: "UAE", currency: "AED", class_time: "6:30 PM", timezone: "UAE time", accounts: ["uae_bank"] }],
    options: [
      { key: "full", name: "Full Course", kind: "bundle" },
      { key: "m1", name: "Module 1", kind: "module", free: false, wa_group: "https://chat.whatsapp.com/abcdefghij12" },
    ],
    module_mix: { enabled: true, bundle: "full" },
    tiers: [{ key: "g3", label: "Group of 3", size: 3, percent_off: 20 }, { key: "g5", label: "Group 2-5", min: 2, max: 5, percent_off: 10 }],
    prices: {
      full: { UAE: { amount: 200, early: 160, group_totals: { g3: 480 }, early_group_totals: { g3: 384 } } },
      m1: { UAE: { amount: 80 } },
    },
  },
  modules: [{ key: "module-1", title: "Foundations", format: "3-Day Workshop", days: 3, option: "m1" }],
});

describe("buildRegistration", () => {
  it("maps the full example", () => {
    const r = buildRegistration(base());
    const c = r.registration;
    expect(c.enabled).toBe(true);
    expect(c.regions[0]).toEqual({ key: "UAE", label: "UAE", currency: "AED", classTime: "6:30 PM", timezoneLabel: "UAE time", accountKeys: ["uae_bank"] });
    expect(c.options[1]).toMatchObject({ key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/abcdefghij12" });
    expect(c.tiers[0]).toMatchObject({ key: "g3", minSize: 3, maxSize: 3, percentOff: 20 });
    expect(c.tiers[1]).toMatchObject({ minSize: 2, maxSize: 5 });
    expect(c.prices.full.UAE).toEqual({ amount: 200, earlyAmount: 160, groupTotals: { g3: 480 }, earlyGroupTotals: { g3: 384 } });
    expect(c.modes).toEqual(["live", "recorded"]);
    expect(c.recordedPercentOfRegular).toBe(60);
    expect(c.defaultRegionKey).toBe("UAE");
    expect(c.earlyBirdEndsAt).toBe("2026-10-25T23:59:00+04:00");
    expect(c.whatsappVerifyNumber).toBe("923700199429");
    expect(c.eventLabel).toBe("PPC Batch 3");
    expect(c.refPrefix).toBe("PPC");
    expect(c.professions).toEqual(["Pharmacist", "Doctor"]);
    expect(c.discoveryOptions).toEqual(["Instagram"]);
    expect(c.moduleMix).toEqual({ enabled: true, bundleOptionKey: "full" });
    expect(r.modules).toEqual([{ key: "module-1", title: "Foundations", format: "3-Day Workshop", days: 3, optionKey: "m1" }]);
    expect(r.problems.filter((p) => p.level === "error")).toEqual([]);
  });

  it("defaults default_region to first region and kind from module references", () => {
    const f = base();
    delete (f.registration as Record<string, unknown>).default_region;
    for (const o of f.registration.options) delete (o as Record<string, unknown>).kind;
    const r = buildRegistration(f);
    expect(r.registration.defaultRegionKey).toBe("UAE");
    expect(r.registration.options.map((o) => o.kind)).toEqual(["bundle", "module"]);
  });

  it("is not enabled without regions and options", () => {
    expect(buildRegistration({}).registration.enabled).toBe(false);
  });

  it("reads a money string with a warning", () => {
    const f = base();
    (f.registration.prices.full.UAE as Record<string, unknown>).amount = "AED 1,200";
    const r = buildRegistration(f);
    expect(r.registration.prices.full.UAE.amount).toBe(1200);
    expect(r.problems).toContainEqual({ level: "warning", message: "The price of Full Course for UAE was read as 1200. Please check it." });
  });

  it("skips an unreadable price with a warning", () => {
    const f = base();
    (f.registration.prices.full.UAE as Record<string, unknown>).amount = "free";
    const r = buildRegistration(f);
    expect(r.registration.prices.full).toBeUndefined();
    expect(r.problems).toContainEqual({ level: "warning", message: "The price of Full Course for UAE is not a number." });
  });

  it("errors on a price for an unknown option or country", () => {
    const f = base();
    (f.registration.prices as Record<string, unknown>).zzz = { UAE: { amount: 1 } };
    (f.registration.prices.full as Record<string, unknown>).PK = { amount: 1 };
    const r = buildRegistration(f);
    const errs = r.problems.filter((p) => p.level === "error").map((p) => p.message);
    expect(errs).toContain('A price is given for "zzz", which is not one of the options.');
    expect(errs).toContain('A price for Full Course is given for "PK", which is not one of the countries.');
  });

  it("errors on duplicate module keys and unknown module option", () => {
    const f = base();
    f.modules.push({ key: "module-1", title: "Again", format: "x", days: 1, option: "nope" });
    const errs = buildRegistration(f).problems.filter((p) => p.level === "error").map((p) => p.message);
    expect(errs).toContain('Two modules use the code "module-1". Give each module its own code.');
    expect(errs).toContain('The module "Again" points to the option "nope", which does not exist.');
  });

  it("warns when a module option has no price in a country", () => {
    const f = base();
    delete (f.registration.prices as Record<string, unknown>).m1;
    const r = buildRegistration(f);
    expect(r.problems).toContainEqual({ level: "warning", message: "UAE has no price for Module 1." });
  });

  it("errors on bad codes", () => {
    const f = base();
    f.registration.regions[0].code = "uae";
    f.registration.options[0].key = "Full!";
    f.modules[0].key = "Module 1";
    const errs = buildRegistration(f).problems.filter((p) => p.level === "error").map((p) => p.message);
    expect(errs.length).toBeGreaterThanOrEqual(3);
    expect(errs.join(" ")).not.toMatch(/region|variant|schema/i);
  });

  it("surfaces readiness problems as warnings only", () => {
    const f = base();
    f.registration.regions[0].accounts = [];
    const r = buildRegistration(f);
    expect(r.problems).toContainEqual({ level: "warning", message: "Choose at least one payment account for UAE." });
    expect(r.problems.filter((p) => p.level === "error")).toEqual([]);
  });
});
