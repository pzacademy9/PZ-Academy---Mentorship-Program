// Round-2 blind dry-run: three raw chat answers produced by simulated AI runs of the FINAL master prompts
// against the teammate's real databases (round-1 answers are kept in
// .superpowers/sdd/2026-10-17-landing-import-a/dry-run/round1/). Fixtures are read as-is, including the
// chat summary lines before the fenced block. Fields the documents contradict themselves on are left out
// by the AI and listed under "Please check before publishing"; the warning snapshots below pin what that
// means for the importer. See task-10-report.md for the analysis.
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
const pricingItems = (b: BuiltImport) =>
  b.content.sections.find((s) => s.type === "pricing_cards")!.data.items as { name: string; price: string }[];
const allAmounts = (b: BuiltImport): number[] =>
  Object.values(b.content.registration.prices).flatMap((row) =>
    Object.values(row).flatMap((c) =>
      [c.amount, c.earlyAmount, ...Object.values(c.groupTotals ?? {}), ...Object.values(c.earlyGroupTotals ?? {})].filter(
        (n): n is number => n !== undefined,
      ),
    ),
  );

describe("dry-run fixtures (final prompts): ppc-batch-3 (course)", () => {
  const raw = load("ppc-batch-3.answer.txt");
  it("starts with chat summary lines and still imports with no error-level problems", () => {
    expect(raw.startsWith("I have everything I need.")).toBe(true);
    expect(raw).toContain("Please check before publishing");
    const r = buildImport(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.built.warnings.every((w) => w.level !== "error")).toBe(true);
  });
  const b = build("ppc-batch-3.answer.txt");
  it("has the expected sections (no instructors: the document has none)", () => {
    expect(b.kind).toBe("course");
    expect(b.slug).toBe("ppc-batch-3");
    expect(types(b)).toEqual(["hero", "stats", "feature_cards", "curriculum", "pricing_cards", "schedule", "faq", "final_cta"]);
  });
  it("has 4 modules, 5 countries, UAE price for full + each module, whole-number prices", () => {
    expect(b.content.modules.map((m) => m.key)).toEqual(["module-1", "module-2", "module-3", "module-4"]);
    expect(b.content.registration.regions.map((r) => r.key)).toEqual(["UAE", "PK", "KSA", "PH", "IN"]);
    const p = b.content.registration.prices;
    for (const opt of ["full", "m1", "m2", "m3", "m4"]) expect(p[opt].UAE.amount).toBeGreaterThan(0);
    expect(allAmounts(b).every(Number.isInteger)).toBe(true);
  });
  it("saves groups as percentages; only Pakistan has stated totals", () => {
    expect(b.content.registration.tiers.map((t) => [t.key, t.percentOff])).toEqual([["g3", 20], ["g5", 25]]);
    const p = b.content.registration.prices;
    expect(p.full.UAE.groupTotals).toBeUndefined();
    expect(p.full.PK.groupTotals).toEqual({ g3: 14400, g5: 22500 });
    expect(p.full.PK.earlyGroupTotals).toEqual({ g3: 11500, g5: 18000 });
  });
  it("leaves out the conflicting fields", () => {
    expect(b.content.registration.earlyBirdEndsAt).toBe("");
    expect(b.content.settings.countdownTo).toBe("");
    expect(b.content.registration.regions.find((r) => r.key === "UAE")!.classTime).toBe("");
    expect(b.content.registration.whatsappVerifyNumber).toBe("");
    expect(b.content.registration.moduleMix.enabled).toBe(false);
  });
  it("pricing cards say 'See price for your country' on this multi-country page", () => {
    expect(pricingItems(b).map((i) => i.price)).toEqual(["See price for your country", "See price for your country"]);
  });
  it("lists every possible link (countries + modules + countries x modules) with none switched on", () => {
    expect(b.links).toHaveLength(5 + 4 + 5 * 4);
    expect(b.links.filter((l) => l.on)).toHaveLength(0);
  });
  it("flags stale-prone fields for review (recomputed from output)", () => {
    expect(b.content.needsReview).toHaveLength(8);
  });
  it("remaining warnings snapshot", () => {
    expect(msgs(b)).toEqual([
      "Choose at least one payment account for UAE.",
      "Choose at least one payment account for Pakistan.",
      "Choose at least one payment account for Saudi Arabia.",
      "Choose at least one payment account for Philippines.",
      "Choose at least one payment account for India.",
      "Early Bird prices are set but no Early Bird end date. Add the end date, or remove the Early Bird prices.",
      "The WhatsApp number for payment screenshots was not given. Add it in the editor.",
    ]);
  });
});

describe("dry-run fixtures (final prompts): mdc-batch-3 (workshop)", () => {
  const b = build("mdc-batch-3.answer.txt");
  it("imports as a workshop; dates conflict so there is no schedule section", () => {
    expect(b.kind).toBe("workshop");
    expect(b.slug).toBe("mdc-3");
    expect(b.warnings.every((w) => w.level !== "error")).toBe(true);
    expect(types(b)).toEqual(["hero", "rich_text", "feature_cards", "instructors", "curriculum", "pricing_cards", "final_cta"]);
  });
  it("has PK and UAE, one seat option, percent-only group tier, whole-number prices", () => {
    expect(b.content.registration.regions.map((r) => r.key)).toEqual(["PK", "UAE"]);
    expect(b.content.registration.options.map((o) => o.key)).toEqual(["seat"]);
    const seat = b.content.registration.prices.seat;
    expect(seat.PK).toMatchObject({ amount: 3500, earlyAmount: 2700 });
    expect(seat.UAE).toMatchObject({ amount: 100, earlyAmount: 80 });
    expect(seat.PK.groupTotals).toBeUndefined();
    expect(b.content.registration.tiers.map((t) => [t.key, t.minSize, t.percentOff])).toEqual([["g3", 3, 20]]);
    expect(allAmounts(b).every(Number.isInteger)).toBe(true);
  });
  it("leaves out Early Bird end and UAE class time; payment-check number equals chat number", () => {
    expect(b.content.registration.earlyBirdEndsAt).toBe("");
    expect(b.content.registration.regions.find((r) => r.key === "UAE")!.classTime).toBe("");
    expect(b.content.registration.whatsappVerifyNumber).toBe("923700199429");
  });
  it("pricing card says 'See price for your country'", () => {
    expect(pricingItems(b).map((i) => i.price)).toEqual(["See price for your country"]);
  });
  it("has no links part, so no variants are on", () => {
    expect(b.links).toHaveLength(2);
    expect(b.links.filter((l) => l.on)).toHaveLength(0);
  });
  it("flags stale-prone fields for review (recomputed from output)", () => {
    expect(b.content.needsReview).toHaveLength(2);
  });
  it("remaining warnings snapshot", () => {
    expect(msgs(b)).toEqual([
      "Choose at least one payment account for Pakistan.",
      "Choose at least one payment account for UAE.",
      "Early Bird prices are set but no Early Bird end date. Add the end date, or remove the Early Bird prices.",
      "The page has no questions and answers (FAQ).",
    ]);
  });
});

describe("dry-run fixtures (final prompts): w20-diabetes (webinar)", () => {
  const b = build("w20-diabetes.answer.txt");
  it("imports as a webinar with the expected sections", () => {
    expect(b.kind).toBe("webinar");
    expect(b.warnings.every((w) => w.level !== "error")).toBe(true);
    expect(types(b)).toEqual(["hero", "rich_text", "schedule", "instructors", "pricing_cards"]);
  });
  it("has a free option and a Pro option; Pakistan Pro price is left out on purpose", () => {
    expect(b.content.registration.regions.map((r) => r.key)).toEqual(["PK", "PH"]);
    expect(b.content.registration.options.map((o) => [o.key, o.free])).toEqual([["free", true], ["pro", false]]);
    const p = b.content.registration.prices;
    expect(p.free.PK.amount).toBe(0);
    expect(p.free.PH.amount).toBe(0);
    expect(p.pro.PH.amount).toBe(150);
    expect(p.pro.PK).toBeUndefined();
    expect(allAmounts(b).every(Number.isInteger)).toBe(true);
  });
  it("saves the 20% group offer as a percentage with no totals and no Early Bird", () => {
    expect(b.content.registration.tiers.map((t) => [t.key, t.minSize, t.percentOff])).toEqual([["g3", 3, 20]]);
    expect(b.content.registration.earlyBirdEndsAt).toBe("");
  });
  it("Free card says Free; Pro card says 'See price for your country'", () => {
    expect(pricingItems(b).map((i) => [i.name, i.price])).toEqual([
      ["Free Plan", "Free"],
      ["Pro Plan", "See price for your country"],
    ]);
  });
  it("keeps both country links on and flags review fields (recomputed from output)", () => {
    expect(b.links.filter((l) => l.on).map((l) => l.regionKey)).toEqual(["PK", "PH"]);
    expect(b.content.needsReview).toHaveLength(5);
  });
  it("remaining warnings snapshot", () => {
    expect(msgs(b)).toEqual([
      'Add the price of "Pro Plan" for Pakistan.',
      "Choose at least one payment account for Pakistan.",
      "Choose at least one payment account for Philippines.",
      "The WhatsApp number for payment screenshots was not given. Add it in the editor.",
      "The page has no questions and answers (FAQ).",
    ]);
  });
});
