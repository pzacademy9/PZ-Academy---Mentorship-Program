// tests/landing-registration-templates.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEMPLATES, buildTemplate } from "@/lib/landing/templates";
import { computeQuote, type QuoteInput } from "@/lib/landing/registration/pricing";
import { DEFAULT_REGISTRATION, registrationProblems } from "@/lib/landing/registration/config";
import { selectWaGroups } from "@/lib/landing/registration/wa-groups";
import { computeReadiness, updateRegistration } from "@/lib/landing/content";
import { DURING_PPC_EB, AFTER_PPC_EB, DURING_MDC_EB, AFTER_MDC_EB, WA } from "./fixtures/landing-registration";

const SEEDED = ["ppc-batch-3", "mdc-batch-3", "w20-diabetes"];
const build = (id: string) => buildTemplate(id, TEMPLATES.find((t) => t.id === id)!.kind)!;
const quote = (id: string, p: Partial<QuoteInput>) =>
  computeQuote({ config: build(id).registration, regionKey: "PK", mode: "live", optionKeys: [], tierKey: "individual", groupSize: 1, now: DURING_PPC_EB, ...p });

// Legacy PPC page tables: totals for [individual, group of 3, group of 5].
const PPC_FULL: Record<string, { currency: string; eb: number[]; after: number[] }> = {
  PK: { currency: "PKR", eb: [4800, 11500, 18000], after: [6000, 14400, 22500] },
  UAE: { currency: "AED", eb: [160, 384, 600], after: [200, 480, 750] },
  KSA: { currency: "SAR", eb: [160, 384, 600], after: [200, 480, 750] },
  PH: { currency: "PHP", eb: [2400, 5760, 9000], after: [3000, 7200, 11250] },
  IN: { currency: "INR", eb: [3200, 7680, 12000], after: [4000, 9600, 15000] },
  INTL: { currency: "USD", eb: [44, 105, 164], after: [55, 131, 204] },
};
const PPC_MODULE: Record<string, { eb: number[]; after: number[] }> = {
  PK: { eb: [1600, 3840, 6000], after: [2000, 4800, 7500] },
  UAE: { eb: [40, 96, 150], after: [50, 120, 188] },
  KSA: { eb: [40, 96, 150], after: [50, 120, 188] },
  PH: { eb: [720, 1728, 2700], after: [900, 2160, 3375] },
  IN: { eb: [960, 2304, 3600], after: [1200, 2880, 4500] },
  INTL: { eb: [16, 38, 60], after: [20, 48, 75] },
};
const TIERS: [string, number][] = [["individual", 1], ["group3", 3], ["group5", 5]];

describe("PPC Batch 3 template reproduces the legacy price table", () => {
  it("spec fixtures: PKR Early Bird Full Course individual 4,800 and group of 3 11,500", () => {
    expect(quote("ppc-batch-3", { optionKeys: ["full"] })).toMatchObject({ ok: true, currency: "PKR", total: 4800 });
    expect(quote("ppc-batch-3", { optionKeys: ["full"], tierKey: "group3", groupSize: 3 })).toMatchObject({ ok: true, total: 11500 });
  });
  for (const [region, row] of Object.entries(PPC_FULL)) {
    it(`Full Course in ${region} (${row.currency}), Early Bird and after`, () => {
      TIERS.forEach(([tierKey, groupSize], i) => {
        expect(quote("ppc-batch-3", { regionKey: region, optionKeys: ["full"], tierKey, groupSize, now: DURING_PPC_EB }), `${region} EB ${tierKey}`)
          .toMatchObject({ ok: true, currency: row.currency, total: row.eb[i] });
        expect(quote("ppc-batch-3", { regionKey: region, optionKeys: ["full"], tierKey, groupSize, now: AFTER_PPC_EB }), `${region} after ${tierKey}`)
          .toMatchObject({ ok: true, currency: row.currency, total: row.after[i] });
      });
    });
  }
  for (const [region, row] of Object.entries(PPC_MODULE)) {
    it(`one module in ${region}, Early Bird and after`, () => {
      for (const module of ["m1", "m4"]) {
        TIERS.forEach(([tierKey, groupSize], i) => {
          expect(quote("ppc-batch-3", { regionKey: region, optionKeys: [module], tierKey, groupSize, now: DURING_PPC_EB }), `${region} ${module} EB ${tierKey}`)
            .toMatchObject({ ok: true, total: row.eb[i] });
          expect(quote("ppc-batch-3", { regionKey: region, optionKeys: [module], tierKey, groupSize, now: AFTER_PPC_EB }), `${region} ${module} after ${tierKey}`)
            .toMatchObject({ ok: true, total: row.after[i] });
        });
      }
    });
  }
  it("per-person Full Course prices: AED/SAR 160 -> 200, PHP 2,400 -> 3,000, INR 3,200 -> 4,000, USD 44 -> 55", () => {
    const perPerson: Record<string, [number, number]> = { UAE: [160, 200], KSA: [160, 200], PH: [2400, 3000], IN: [3200, 4000], INTL: [44, 55] };
    for (const [region, [eb, after]] of Object.entries(perPerson)) {
      expect(quote("ppc-batch-3", { regionKey: region, optionKeys: ["full"], now: DURING_PPC_EB }), region).toMatchObject({ perPerson: eb, listPerPerson: after });
      expect(quote("ppc-batch-3", { regionKey: region, optionKeys: ["full"], now: AFTER_PPC_EB }), region).toMatchObject({ perPerson: after });
    }
  });
  it("matches the legacy 'each' figures shown under group prices", () => {
    expect(quote("ppc-batch-3", { optionKeys: ["full"], tierKey: "group3", groupSize: 3 })).toMatchObject({ perPerson: 3833 });
    expect(quote("ppc-batch-3", { regionKey: "INTL", optionKeys: ["full"], tierKey: "group5", groupSize: 5 })).toMatchObject({ perPerson: 33 });
    expect(quote("ppc-batch-3", { regionKey: "INTL", optionKeys: ["full"], tierKey: "group3", groupSize: 3, now: AFTER_PPC_EB })).toMatchObject({ perPerson: 44 });
    expect(quote("ppc-batch-3", { regionKey: "UAE", optionKeys: ["m2"], tierKey: "group5", groupSize: 5, now: AFTER_PPC_EB })).toMatchObject({ perPerson: 38 });
    expect(quote("ppc-batch-3", { regionKey: "INTL", optionKeys: ["m3"], tierKey: "group3", groupSize: 3 })).toMatchObject({ perPerson: 13 });
  });
  it("recorded PKR matches the legacy after-Early-Bird table x 0.85, even during Early Bird", () => {
    TIERS.forEach(([tierKey, groupSize], i) => {
      expect(quote("ppc-batch-3", { optionKeys: ["full"], mode: "recorded", tierKey, groupSize }), tierKey)
        .toMatchObject({ ok: true, total: [5100, 12240, 19125][i] });
    });
  });
  it("modules add up, and all four collapse to the Full Course", () => {
    expect(quote("ppc-batch-3", { optionKeys: ["m1", "m3"] })).toMatchObject({ total: 3200 });
    expect(quote("ppc-batch-3", { optionKeys: ["m1", "m2", "m3", "m4"] })).toMatchObject({ optionKeys: ["full"], total: 4800 });
  });
  it("WhatsApp groups follow the PPC rule with the real links", () => {
    const c = build("ppc-batch-3").registration;
    expect(selectWaGroups(c, ["full"], "live").map((b) => b.url)).toEqual([WA.full]);
    expect(selectWaGroups(c, ["m1", "m3"], "live").map((b) => b.url)).toEqual([WA.m1, WA.m3]);
    expect(selectWaGroups(c, ["full"], "recorded")).toEqual([]);
  });
});

describe("MDC Batch 3 template", () => {
  const mdc = (p: Partial<QuoteInput>) => quote("mdc-batch-3", { optionKeys: ["workshop"], now: DURING_MDC_EB, ...p });
  it("PKR per person: Early Bird 2,700 / group 2,160; regular 3,500 / 2,800; recorded 2,975 / 2,380", () => {
    expect(mdc({})).toMatchObject({ ok: true, perPerson: 2700 });
    expect(mdc({ tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 2160, total: 6480 });
    expect(mdc({ now: AFTER_MDC_EB })).toMatchObject({ perPerson: 3500 });
    expect(mdc({ now: AFTER_MDC_EB, tierKey: "group", groupSize: 5 })).toMatchObject({ perPerson: 2800, total: 14000 });
    expect(mdc({ mode: "recorded" })).toMatchObject({ perPerson: 2975 });
    expect(mdc({ mode: "recorded", tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 2380 });
  });
  it("AED and SAR per person: Early Bird 80 / 64; regular 100 / 80; recorded 85 / 68", () => {
    for (const region of ["UAE", "KSA"]) {
      expect(mdc({ regionKey: region }), region).toMatchObject({ perPerson: 80 });
      expect(mdc({ regionKey: region, tierKey: "group", groupSize: 3 }), region).toMatchObject({ perPerson: 64 });
      expect(mdc({ regionKey: region, now: AFTER_MDC_EB }), region).toMatchObject({ perPerson: 100 });
      expect(mdc({ regionKey: region, now: AFTER_MDC_EB, tierKey: "group", groupSize: 3 }), region).toMatchObject({ perPerson: 80 });
      expect(mdc({ regionKey: region, mode: "recorded" }), region).toMatchObject({ perPerson: 85 });
      expect(mdc({ regionKey: region, mode: "recorded", tierKey: "group", groupSize: 3 }), region).toMatchObject({ perPerson: 68 });
    }
  });
  it("International USD: Early Bird 22, regular 27, recorded 23, recorded group 18", () => {
    expect(mdc({ regionKey: "INTL" })).toMatchObject({ currency: "USD", perPerson: 22 });
    expect(mdc({ regionKey: "INTL", now: AFTER_MDC_EB })).toMatchObject({ perPerson: 27 });
    expect(mdc({ regionKey: "INTL", mode: "recorded" })).toMatchObject({ perPerson: 23 });
    expect(mdc({ regionKey: "INTL", mode: "recorded", tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 18 });
  });
  it("keeps the 100-seat limit", () => expect(build("mdc-batch-3").registration.capacity).toBe(100));
});

describe("Webinar 20 template", () => {
  const w = (p: Partial<QuoteInput>) => quote("w20-diabetes", { optionKeys: ["pro"], ...p });
  it("Pakistan: Free 0, Pro 399, group 319 each", () => {
    expect(w({ optionKeys: ["free"] })).toMatchObject({ ok: true, isFree: true, total: 0 });
    expect(w({})).toMatchObject({ ok: true, currency: "PKR", total: 399 });
    expect(w({ tierKey: "group", groupSize: 3 })).toMatchObject({ perPerson: 319, total: 957 });
  });
  it("Philippines is Pro only: 150, group 120 each", () => {
    expect(w({ regionKey: "PH" })).toMatchObject({ currency: "PHP", total: 150 });
    expect(w({ regionKey: "PH", tierKey: "group", groupSize: 4 })).toMatchObject({ perPerson: 120, total: 480 });
    expect(w({ regionKey: "PH", optionKeys: ["free"] })).toEqual({ ok: false, reason: "no_price" });
  });
  it("keeps the blank Register link", () => expect(build("w20-diabetes").settings.registerUrl).toBe(""));
});

describe("seeded registration settings are complete", () => {
  it("each seeded template has registration on and no setup problems", () => {
    for (const id of SEEDED) {
      const r = build(id).registration;
      expect(r.enabled, id).toBe(true);
      expect(registrationProblems(r), id).toEqual([]);
    }
  });
  it("every payment account the seeds use is seeded by migration 0069", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0069_landing_registration.sql"), "utf8");
    for (const id of SEEDED) {
      for (const region of build(id).registration.regions) {
        for (const key of region.accountKeys) expect(sql, `${id} ${region.key} ${key}`).toContain(`('${key}',`);
      }
    }
  });
  it("blank templates start with registration switched off", () => {
    for (const id of ["blank-course", "blank-workshop", "blank-webinar"]) expect(build(id).registration, id).toEqual(DEFAULT_REGISTRATION);
  });
  it("turning registration off brings back the Register-link requirement on W20", () => {
    const t = TEMPLATES.find((x) => x.id === "w20-diabetes")!;
    const off = updateRegistration(build("w20-diabetes"), { enabled: false });
    expect(computeReadiness(off, { title: t.label, slug: t.id }).problems.some((p) => /Register button/i.test(p.message))).toBe(true);
  });
});
