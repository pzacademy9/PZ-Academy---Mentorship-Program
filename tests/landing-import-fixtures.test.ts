// Task 10 dry-run: three raw chat answers produced by blind "simulated AI" runs of the master prompts
// against the teammate's real databases. Fixtures are read as-is (chat summary lines + fenced block).
//
// Remaining warnings at the time of the dry run (kept as explicit snapshots below so changes are visible):
//   PPC: 5x "Choose at least one payment account" (expected, accounts are chosen in the editor),
//        WhatsApp-for-payment-checks missing (document gave no number), countdown reminder.
//   MDC: 2x payment account, no FAQ.
//   W20: 2x payment account, WhatsApp-for-payment-checks missing, no FAQ.
// See .superpowers/sdd/2026-10-17-landing-import-a/task-10-report.md for the analysis.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildImport, type BuiltImport } from "@/lib/landing/import/build-content";

const load = (name: string): string => readFileSync(join(__dirname, "fixtures", "landing-import", name), "utf8");
const build = (name: string): BuiltImport => {
  const r = buildImport(load(name));
  if (!r.ok) throw new Error(r.errors.join(" | "));
  return r.built;
};
const types = (b: BuiltImport) => b.content.sections.map((s) => s.type);
const msgs = (b: BuiltImport) => b.warnings.map((w) => w.message);

describe("dry-run fixtures: ppc-batch-3 (course)", () => {
  const raw = load("ppc-batch-3.answer.txt");
  it("starts with chat summary lines and still imports", () => {
    expect(raw.startsWith("I have everything I need.")).toBe(true);
    const r = buildImport(raw);
    expect(r.ok).toBe(true);
  });
  const b = build("ppc-batch-3.answer.txt");
  it("has no error-level problems and the expected sections", () => {
    expect(b.warnings.every((w) => w.level !== "error")).toBe(true);
    expect(b.kind).toBe("course");
    expect(b.slug).toBe("ppc-batch-3");
    expect(types(b)).toEqual(["hero", "stats", "feature_cards", "curriculum", "pricing_cards", "schedule", "faq", "final_cta"]);
  });
  it("has 4 modules, 5 regions, UAE prices for full + each module, group totals", () => {
    expect(b.content.modules.map((m) => m.key)).toEqual(["module-1", "module-2", "module-3", "module-4"]);
    expect(b.content.registration.regions.map((r) => r.key)).toEqual(["UAE", "PK", "KSA", "PH", "IN"]);
    const p = b.content.registration.prices;
    for (const opt of ["full", "m1", "m2", "m3", "m4"]) expect(p[opt].UAE.amount).toBeGreaterThan(0);
    expect(p.full.UAE.groupTotals).toEqual({ g3: 480, g5: 750 });
    expect(p.full.PK.earlyGroupTotals).toEqual({ g3: 11500, g5: 18000 });
    expect(b.content.registration.tiers.map((t) => t.key)).toEqual(["g3", "g5"]);
  });
  it("lists every possible link: countries + modules + countries x modules", () => {
    const c = b.content.registration.regions.length;
    const m = b.content.modules.length;
    expect(b.links).toHaveLength(c + m + c * m);
    expect(b.links.filter((l) => l.on).length).toBeGreaterThan(0);
  });
  it("flags stale-prone fields for review", () => {
    expect(b.content.needsReview.length).toBeGreaterThanOrEqual(1);
  });
  it("remaining warnings snapshot", () => {
    expect(msgs(b)).toEqual([
      "Choose at least one payment account for UAE.",
      "Choose at least one payment account for Pakistan.",
      "Choose at least one payment account for Saudi Arabia.",
      "Choose at least one payment account for Philippines.",
      "Choose at least one payment account for India.",
      "The WhatsApp number for payment screenshots was not given. Add it in the editor.",
      "Check the countdown date before publishing.",
    ]);
  });
});

describe("dry-run fixtures: mdc-batch-3 (workshop)", () => {
  const b = build("mdc-batch-3.answer.txt");
  it("imports as a workshop with the expected sections", () => {
    expect(b.kind).toBe("workshop");
    expect(b.slug).toBe("mdc-3");
    expect(b.warnings.every((w) => w.level !== "error")).toBe(true);
    expect(types(b)).toEqual(["hero", "stats", "rich_text", "feature_cards", "instructors", "curriculum", "pricing_cards", "schedule", "final_cta"]);
  });
  it("has PK and UAE with seat prices and group totals", () => {
    expect(b.content.registration.regions.map((r) => r.key)).toEqual(["PK", "UAE"]);
    expect(b.content.registration.options.map((o) => o.key)).toEqual(["seat"]);
    const seat = b.content.registration.prices.seat;
    expect(seat.PK.amount).toBe(3500);
    expect(seat.PK.earlyGroupTotals).toEqual({ g3: 6480 });
    expect(seat.UAE.amount).toBe(100);
    expect(b.content.registration.earlyBirdEndsAt).toContain("2026-08-29");
    expect(b.content.needsReview.length).toBeGreaterThanOrEqual(1);
  });
  it("remaining warnings snapshot", () => {
    expect(msgs(b)).toEqual([
      "Choose at least one payment account for Pakistan.",
      "Choose at least one payment account for UAE.",
      "The page has no questions and answers (FAQ).",
    ]);
  });
});

describe("dry-run fixtures: w20-diabetes (webinar)", () => {
  const b = build("w20-diabetes.answer.txt");
  it("imports as a webinar with the expected sections", () => {
    expect(b.kind).toBe("webinar");
    expect(b.warnings.every((w) => w.level !== "error")).toBe(true);
    expect(types(b)).toEqual(["hero", "rich_text", "schedule", "instructors", "pricing_cards"]);
  });
  it("has PK and PH with one paid option, no early bird, both links on", () => {
    expect(b.content.registration.regions.map((r) => r.key)).toEqual(["PK", "PH"]);
    expect(b.content.registration.prices.seat.PK.amount).toBe(399);
    expect(b.content.registration.prices.seat.PH.amount).toBe(150);
    expect(b.content.registration.prices.seat.PK.earlyAmount).toBeUndefined();
    expect(b.links.filter((l) => l.on)).toHaveLength(2);
    expect(b.content.needsReview.length).toBeGreaterThanOrEqual(1);
  });
  it("remaining warnings snapshot", () => {
    expect(msgs(b)).toEqual([
      "Choose at least one payment account for Pakistan.",
      "Choose at least one payment account for Philippines.",
      "The WhatsApp number for payment screenshots was not given. Add it in the editor.",
      "The page has no questions and answers (FAQ).",
    ]);
  });
});
