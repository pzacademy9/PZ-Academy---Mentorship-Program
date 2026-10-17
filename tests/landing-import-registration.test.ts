import { describe, it, expect } from "vitest";
import { buildRegistration } from "@/lib/landing/import/build-registration";
import { computeQuote } from "@/lib/landing/registration/pricing";
import { MAX_GROUP_SIZE } from "@/lib/landing/registration/config";

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

  it("errors on bad codes with exact messages", () => {
    const f = base();
    f.registration.regions[0].code = "uae";
    f.registration.options[0].key = "Full!";
    f.modules[0].key = "Module 1";
    const errs = buildRegistration(f).problems.filter((p) => p.level === "error").map((p) => p.message);
    expect(errs).toContain('The country code "uae" must be 2 to 6 capital letters, for example PK.');
    expect(errs).toContain('The option code "Full!" must use small letters, digits or _ only.');
    expect(errs).toContain('The module code "Module 1" must use small letters, digits and single dashes, for example module-1.');
    expect(errs.join(" ")).not.toMatch(/region|variant|schema/i);
  });

  it("rejects reserved codes and never pollutes Object.prototype", () => {
    const f = base();
    const opts = f.registration.options as Record<string, unknown>[];
    opts.push(JSON.parse('{"key":"__proto__","name":"Bad"}'));
    (f.registration.prices as Record<string, unknown>) = JSON.parse(
      '{"__proto__":{"UAE":{"amount":5}},"full":{"__proto__":{"amount":5},"constructor":{"amount":1},"UAE":{"amount":200,"group_totals":{"__proto__":3}}}}',
    );
    f.registration.regions.push(JSON.parse('{"code":"constructor"}'));
    f.modules.push(JSON.parse('{"key":"prototype","title":"x","format":"y","days":1}'));
    const r = buildRegistration(f);
    const errs = r.problems.filter((p) => p.level === "error").map((p) => p.message);
    expect(errs).toContain('"__proto__" is a reserved word, pick another code.');
    expect(errs).toContain('"constructor" is a reserved word, pick another code.');
    expect(errs).toContain('"prototype" is a reserved word, pick another code.');
    expect(({} as Record<string, unknown>).amount).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(Object.keys(Object.getPrototypeOf(r.registration.prices) ?? {})).toEqual([]);
  });

  it("gives one line for an unreadable price on a module option", () => {
    const f = base();
    (f.registration.prices.m1.UAE as Record<string, unknown>).amount = "call us";
    const lines = buildRegistration(f).problems.map((p) => p.message).filter((m) => m.includes("Module 1") && m.includes("UAE"));
    expect(lines).toEqual(["The price of Module 1 for UAE is not a number."]);
  });

  it("gives one line for a missing or blank amount", () => {
    for (const opt of ["full", "m1"] as const) {
      for (const cell of [{ early: 150 }, { amount: "" }, { amount: null }]) {
        const f = base();
        (f.registration.prices as Record<string, unknown>)[opt] = { UAE: cell };
        const name = opt === "full" ? "Full Course" : "Module 1";
        const lines = buildRegistration(f).problems.map((p) => p.message).filter((m) => m.includes(name) && m.includes("UAE"));
        expect(lines).toEqual([`The price of ${name} for UAE is missing the amount.`]);
      }
    }
  });

  it("rejects reserved account and group codes", () => {
    const f = base();
    f.registration.regions[0].accounts = ["uae_bank", "__proto__"];
    f.registration.tiers.push({ key: "constructor", label: "X", size: 4, percent_off: 5 } as never);
    const r = buildRegistration(f);
    const errs = r.problems.filter((p) => p.level === "error").map((p) => p.message);
    expect(errs.filter((m) => m === '"__proto__" is a reserved word, pick another code.')).toHaveLength(1);
    expect(errs).toContain('"constructor" is a reserved word, pick another code.');
    expect(r.registration.regions[0].accountKeys).toEqual(["uae_bank"]);
    expect(r.registration.tiers.map((t) => t.key)).toEqual(["g3", "g5"]);
  });

  it("warns about Early Bird prices without an end date", () => {
    const f = base();
    delete (f.registration as Record<string, unknown>).early_bird_ends;
    expect(buildRegistration(f).problems).toContainEqual({
      level: "warning",
      message: "Early Bird prices are set but no Early Bird end date. Add the end date, or remove the Early Bird prices.",
    });
  });

  it("does not throw on odd input and explains a non-object price", () => {
    expect(() => buildRegistration({ modules: { a: 1 } })).not.toThrow();
    const f = base();
    (f.registration.prices.full as Record<string, unknown>).UAE = 200;
    const r = buildRegistration(f);
    expect(r.problems).toContainEqual({ level: "warning", message: "The price of Full Course for UAE is not written correctly. Write it as amount: 200." });
    expect(r.problems.filter((p) => p.message.startsWith('Add the price of "Full Course" for UAE'))).toEqual([]);
  });

  it("maps tier size and min/max exactly", () => {
    const t = buildRegistration(base()).registration.tiers;
    expect(t[0]).toEqual({ key: "g3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 20 });
    expect(t[1]).toEqual({ key: "g5", label: "Group 2-5", minSize: 2, maxSize: 5, percentOff: 10 });
  });

  it("rejects negatives and strings holding several numbers", () => {
    for (const bad of ["200 AED or 300", "-50", -5]) {
      const f = base();
      (f.registration.prices.full.UAE as Record<string, unknown>).amount = bad;
      const r = buildRegistration(f);
      expect(r.registration.prices.full).toBeUndefined();
      expect(r.problems.map((p) => p.message)).toContain("The price of Full Course for UAE is not a number.");
    }
  });

  it("surfaces readiness problems as warnings only", () => {
    const f = base();
    f.registration.regions[0].accounts = [];
    const r = buildRegistration(f);
    expect(r.problems).toContainEqual({ level: "warning", message: "Choose at least one payment account for UAE." });
    expect(r.problems.filter((p) => p.level === "error")).toEqual([]);
  });
});

describe("payment WhatsApp message", () => {
  const msgs = (v: unknown) => {
    const b = base();
    (b.registration as Record<string, unknown>).verify_whatsapp = v;
    return buildRegistration(b).problems.map((p) => p.message);
  };
  it("says the number was not given when it is empty", () => {
    const m = msgs(undefined);
    expect(m).toContain("The WhatsApp number for payment screenshots was not given. Add it in the editor.");
    expect(m.join(" ")).not.toMatch(/digits only/);
  });
  it("keeps the format message for a malformed number", () => {
    expect(msgs("abc").join(" ")).toMatch(/digits only/);
  });
});

describe("whole-number prices and open-ended groups", () => {
  it("rounds non-whole prices and says so", () => {
    const b = base();
    (b.registration.prices.full.UAE as Record<string, unknown>) = { amount: 200.4, early: 160, group_totals: { g3: 480 }, early_group_totals: { g3: 187.5 } };
    const r = buildRegistration(b);
    expect(r.registration.prices.full.UAE.amount).toBe(200);
    expect(r.registration.prices.full.UAE.earlyGroupTotals).toEqual({ g3: 188 });
    const m = r.problems.map((p) => p.message);
    expect(m.some((x) => /200\.4 was rounded to 200 because prices must be whole numbers/.test(x))).toBe(true);
    expect(m.some((x) => /187\.5 was rounded to 188/.test(x))).toBe(true);
  });

  it("a tier with only min goes up to the largest group, and a group of 6 prices correctly", () => {
    const b = base();
    b.registration.tiers = [{ key: "g5", label: "Group of 5 or more", min: 5, percent_off: 25 }] as never;
    b.registration.prices.full.UAE = { amount: 200, early: 160 } as never;
    const r = buildRegistration(b);
    expect(r.registration.tiers[0]).toMatchObject({ minSize: 5, maxSize: MAX_GROUP_SIZE });
    const q = computeQuote({ config: r.registration, regionKey: "UAE", mode: "live", optionKeys: ["full"], tierKey: "g5", groupSize: 6, now: new Date("2026-11-01T00:00:00Z") });
    expect(q.ok && q.total).toBe(900); // 200 less 25% = 150 each
  });
});
