import { describe, it, expect } from "vitest";
import { buildImport, type BuiltImport } from "@/lib/landing/import/build-content";
import { contentSchema, KIND_SECTIONS } from "@/lib/landing/content";

const FRONT = `format: pz-landing/1
kind: course
title: Practical Pharmacology Course
slug: ppc-batch-3
seo: { title: "PPC", description: "Learn pharmacology." }
settings:
  register_label: Join now
  whatsapp: "923700199429"
  countdown_to: 2026-10-25T23:59:00+04:00
  countdown_label: Early Bird ends in
registration:
  early_bird_ends: 2026-10-25T23:59:00+04:00
  regions:
    - { code: UAE, name: UAE, currency: AED }
  options:
    - { key: full, name: Full Course, kind: bundle }
    - { key: m1, name: Module 1, kind: module }
    - { key: m2, name: Module 2, kind: module }
  prices:
    full: { UAE: { amount: 200 } }
    m1: { UAE: { amount: 80 } }
    m2: { UAE: { amount: 80 } }
modules:
  - { key: module-1, title: Module 1, format: 3-Day Workshop, days: 3, option: m1 }
  - { key: module-2, title: Module 2, format: 3-Day Workshop, days: 3, option: m2 }
links:
  - { country: uae, on: true }
  - { module: module-2, on: true, hero_title: "Module 2: Therapeutics", hero_subtitle: "Deep dive" }
`;

const sec = (type: string, body: string) => `\n## Section: ${type}\n\`\`\`yaml\n${body}\n\`\`\`\n`;
const file = (front = FRONT, sections = "") => `---\n${front}---\n${sections}`;
const ok = (raw: string): BuiltImport => {
  const r = buildImport(raw);
  if (!r.ok) throw new Error(r.errors.join(" | "));
  return r.built;
};
const errs = (raw: string): string[] => {
  const r = buildImport(raw);
  if (r.ok) throw new Error("expected errors");
  return r.errors;
};
const noModules = (extra = "") => `format: pz-landing/1\nkind: course\ntitle: Plain Course\n${extra}`;

describe("buildImport", () => {
  it("builds sections in kind order and omits absent ones", () => {
    const raw = file(FRONT, sec("faq", "items:\n  - { q: Why?, a: Because. }") + sec("hero", "headline: Hello"));
    const b = ok(raw);
    expect(b.kind).toBe("course");
    expect(b.title).toBe("Practical Pharmacology Course");
    expect(b.slug).toBe("ppc-batch-3");
    expect(b.content.sections.map((s) => s.type)).toEqual(["hero", "faq"]);
    expect(KIND_SECTIONS.course.indexOf("hero")).toBeLessThan(KIND_SECTIONS.course.indexOf("faq"));
    expect(contentSchema.safeParse(b.content).success).toBe(true);
    expect(new Set(b.content.sections.map((s) => s.id)).size).toBe(2);
  });

  it("respects enabled: false", () => {
    const b = ok(file(FRONT, sec("hero", "headline: Hi\nenabled: false")));
    expect(b.content.sections[0].enabled).toBe(false);
  });

  it("drops unknown section fields with a warning naming the section", () => {
    const b = ok(file(FRONT, sec("hero", "headline: Hi\nbogus: 1")));
    expect(b.content.sections[0].data).not.toHaveProperty("bogus");
    expect(b.warnings.some((w) => w.message.includes("Hero (top of page)") && w.message.includes("bogus"))).toBe(true);
  });

  it("keeps a defined module tag and clears an unknown one with a warning", () => {
    const b = ok(file(FRONT, sec("schedule", "items:\n  - { when: Fri, title: A, module: module-1 }\n  - { when: Sat, title: B, module: nope }")));
    const items = b.content.sections[0].data.items as { module: string }[];
    expect(items[0].module).toBe("module-1");
    expect(items[1].module).toBe("");
    expect(b.warnings.some((w) => w.message.includes("nope"))).toBe(true);
  });

  it("forces pictures empty with one warning", () => {
    const b = ok(file(FRONT.replace('description: "Learn pharmacology." }', 'description: "x", ogImage: "https://a.b/c.png" }'),
      sec("hero", "headline: Hi\nimage: https://a.b/c.png") + sec("instructors", "items:\n  - { name: Dr A, photo: https://a.b/d.png }")));
    const hero = b.content.sections.find((s) => s.type === "hero")!;
    expect(hero.data.image).toBe("");
    const inst = b.content.sections.find((s) => s.type === "instructors")!;
    expect((inst.data.items as { photo: string }[])[0].photo).toBe("");
    expect(b.content.seo.ogImage).toBe("");
    expect(b.warnings.filter((w) => w.message.includes("Pictures are added in the editor"))).toHaveLength(1);
  });

  it("maps settings and seo", () => {
    const b = ok(file());
    expect(b.content.settings).toMatchObject({
      registerLabel: "Join now", whatsappNumber: "923700199429", countdownLabel: "Early Bird ends in",
    });
    expect(b.content.settings.countdownTo).toContain("2026-10-25");
    expect(b.content.seo).toMatchObject({ title: "PPC", description: "Learn pharmacology." });
    expect(b.content.registration.regions[0].key).toBe("UAE");
    expect(b.content.modules.map((m) => m.key)).toEqual(["module-1", "module-2"]);
  });

  it("rejects blank title, bad kind", () => {
    expect(errs(file(FRONT.replace("title: Practical Pharmacology Course", 'title: "  "'))).join(" ")).toMatch(/name|title/i);
    expect(errs(file(FRONT.replace("kind: course", "kind: party"))).join(" ")).toMatch(/kind|course, workshop/i);
    expect(errs(file(FRONT.replace("kind: course\n", ""))).length).toBeGreaterThan(0);
  });

  it("derives a missing slug and rejects an invalid one", () => {
    const b = ok(file(noModules("") ));
    expect(b.slug).toBe("plain-course");
    expect(errs(file(noModules("slug: Bad Slug!\n"))).length).toBeGreaterThan(0);
    expect(errs(file(noModules("slug: api\n"))).join(" ")).toMatch(/reserved/);
  });

  it("lists all links: 1 country + 2 modules = 5", () => {
    const b = ok(file());
    expect(b.links).toHaveLength(5);
    const find = (r: string | null, m: string | null) => b.links.find((l) => l.regionKey === r && l.moduleKey === m)!;
    expect(find("UAE", null).on).toBe(true);
    expect(find(null, "module-1").on).toBe(false);
    expect(find(null, "module-2")).toMatchObject({ on: true, heroTitle: "Module 2: Therapeutics", heroSubtitle: "Deep dive" });
    expect(find("UAE", "module-2").on).toBe(false);
  });

  it("errors on a link to an unknown country or module", () => {
    expect(errs(file(FRONT.replace("country: uae", "country: PK"))).join(" ")).toMatch(/PK/);
    expect(errs(file(FRONT.replace("module: module-2, on", "module: module-9, on"))).join(" ")).toMatch(/module-9/);
  });

  it("flags stale-prone fields for review with section ids", () => {
    const b = ok(file(FRONT,
      sec("hero", "headline: Hi\ndateLine: Fri 7 PM") +
      sec("schedule", "items:\n  - { when: Fri, title: A }\n  - { when: Sat, title: B }") +
      sec("pricing_cards", "note: Early\nitems:\n  - { name: Full, price: AED 200, oldPrice: AED 300 }\n  - { name: M1, price: AED 80 }")));
    const id = (t: string) => b.content.sections.find((s) => s.type === t)!.id;
    const r = b.content.needsReview;
    expect(r).toContain(`${id("hero")}:dateLine`);
    expect(r).toContain(`${id("schedule")}:items.0.when`);
    expect(r).toContain(`${id("schedule")}:items.1.when`);
    expect(r).toContain(`${id("pricing_cards")}:items.0.price`);
    expect(r).toContain(`${id("pricing_cards")}:items.0.oldPrice`);
    expect(r).toContain(`${id("pricing_cards")}:items.1.price`);
    expect(r).not.toContain(`${id("pricing_cards")}:items.1.oldPrice`);
    expect(r).toContain(`${id("pricing_cards")}:note`);
  });

  it("warns about modules without dates, no FAQ and Early Bird without end date", () => {
    const b = ok(file(FRONT, sec("schedule", "items:\n  - { when: Fri, title: A, module: module-1 }")));
    expect(b.warnings.map((w) => w.message)).toContain("Module 2 has no dates.");
    expect(b.warnings.some((w) => /question/i.test(w.message))).toBe(true);
    const front = FRONT.replace("  early_bird_ends: 2026-10-25T23:59:00+04:00\n", "").replace("amount: 200 }", "amount: 200, early: 160 }");
    expect(ok(file(front)).warnings.some((w) => /Early Bird/.test(w.message) && /end date/.test(w.message))).toBe(true);
  });

  it("blocks on registration errors and never uses jargon", () => {
    const e = errs(file(FRONT.replace("module-2, title", "module-1, title")));
    expect(e.join(" ")).toMatch(/module-1/);
    for (const m of e) expect(m).not.toMatch(/variant|override|schema|yaml/i);
  });

  it("reports content that fails validation in plain words", () => {
    const e = errs(file(FRONT, sec("hero", `headline: ${"x".repeat(200)}`)));
    expect(e.join(" ")).toContain("Hero (top of page)");
  });

  it("passes parse errors through", () => {
    expect(errs("hello").length).toBeGreaterThan(0);
  });
});
