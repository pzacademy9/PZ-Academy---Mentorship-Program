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

  it("flags only non-empty stale fields", () => {
    const b = ok(file(FRONT, sec("hero", "headline: Hi") + sec("pricing_cards", "items:\n  - { name: Full, price: AED 200 }") + sec("schedule", "items:\n  - { when: '', title: A }")));
    const id = (t: string) => b.content.sections.find((s) => s.type === t)!.id;
    expect(b.content.needsReview).not.toContain(`${id("hero")}:dateLine`);
    expect(b.content.needsReview).not.toContain(`${id("pricing_cards")}:note`);
    expect(b.content.needsReview).not.toContain(`${id("schedule")}:items.0.when`);
  });

  it("warns to check the countdown date", () => {
    expect(ok(file()).warnings.map((w) => w.message)).toContain("Check the countdown date before publishing.");
  });

  it("puts extra sections before the closing call to action", () => {
    const b = ok(file(FRONT, sec("final_cta", "headline: Go") + sec("rich_text", "heading: H\nbody: B") + sec("hero", "headline: Hi")));
    expect(b.content.sections.map((s) => s.type)).toEqual(["hero", "rich_text", "final_cta"]);
  });

  it("gives plain messages for long values, never raw validator text", () => {
    const e1 = errs(file(FRONT.replace('description: "Learn pharmacology."', `description: "${"x".repeat(301)}"`)));
    expect(e1.join(" ")).toBe("The search preview description is too long (max 300 letters).");
    const faq = Array.from({ length: 41 }, () => "  - { q: Q, a: A }").join("\n");
    const e2 = errs(file(FRONT, sec("faq", `items:\n${faq}`)));
    expect(e2.join(" ")).toContain("Questions and answers: too many items (max 40).");
    const e3 = errs(file(FRONT.replace("title: Module 2,", `title: ${"y".repeat(130)},`)));
    expect(e3.join(" ")).toContain("module-2: the title is too long (max 120 letters).");
    const e4 = errs(file(FRONT.replace("days: 3, option: m2", "days: 99, option: m2")));
    expect(e4.join(" ")).toContain("module-2: the number of days must be a whole number from 0 to 60.");
    for (const m of [...e1, ...e2, ...e3, ...e4]) expect(m).not.toMatch(/Too big|expected|Invalid/);
  });

  it("warns once when a field cannot be read", () => {
    const b = ok(file(FRONT, sec("faq", "items: nope") + sec("hero", "headline: [a, b]")));
    const msgs = b.warnings.map((w) => w.message);
    expect(msgs.filter((m) => m.includes("'Questions' could not be read and was left empty"))).toHaveLength(1);
    expect(msgs.some((m) => m.includes("'Headline' could not be read"))).toBe(true);
  });

  it("warns about an unused item field once per section", () => {
    const b = ok(file(FRONT, sec("faq", "items:\n  - { q: A, a: B, zzz: 1 }\n  - { q: C, a: D, zzz: 2 }")));
    const hits = b.warnings.filter((w) => w.message.includes("zzz"));
    expect(hits).toHaveLength(1);
    expect(hits[0].message).not.toContain("items.");
  });

  it("matches link modules case-insensitively, warns on duplicates and bad lists", () => {
    const b = ok(file(FRONT.replace("module: module-2, on: true", "module: MODULE-2, on: true")));
    expect(b.links.find((l) => l.moduleKey === "module-2" && !l.regionKey)!.on).toBe(true);
    const dup = ok(file(FRONT.replace("links:\n", "links:\n  - { country: UAE, on: false }\n")));
    expect(dup.warnings.map((w) => w.message)).toContain("UAE is listed twice; the last entry is used.");
    const bad = ok(file(FRONT.replace(/links:[\s\S]*$/, "links: nope\n")));
    expect(bad.warnings.some((w) => /links list/.test(w.message))).toBe(true);
  });

  it("only says a module has no dates when no untagged rows exist", () => {
    const b = ok(file(FRONT, sec("schedule", "items:\n  - { when: Fri, title: A }")));
    expect(b.warnings.some((w) => /has no dates/.test(w.message))).toBe(false);
  });
});

describe("Early Bird without an end date", () => {
  it("is reported exactly once", () => {
    const raw = file(noModules(`registration:
  regions:
    - { code: UAE, name: UAE, currency: AED }
  options:
    - { key: full, name: Full Course, kind: bundle }
  prices:
    full: { UAE: { amount: 200, early: 160 } }
`));
    const b = ok(raw);
    expect(b.warnings.filter((w) => /Early Bird/.test(w.message))).toHaveLength(1);
  });
});

describe("buildImport: final review fixes", () => {
  it("accepts a quoted numeric module days and stores a number", () => {
    const b = ok(file(FRONT.replace("days: 3, option: m2", 'days: "4", option: m2')));
    expect(b.content.modules.find((m) => m.key === "module-2")?.days).toBe(4);
    const e = errs(file(FRONT.replace("days: 3, option: m2", 'days: "abc", option: m2')));
    expect(e.join(" ")).toContain("module-2: the number of days must be a whole number from 0 to 60.");
  });

  it("blocks a link hero title or subtitle that is too long, naming the link", () => {
    const t = errs(file(FRONT.replace('hero_title: "Module 2: Therapeutics"', `hero_title: "${"t".repeat(121)}"`)));
    expect(t.join(" ")).toContain("The hero title for module-2 is too long (max 120 letters).");
    const s = errs(file(FRONT.replace('hero_subtitle: "Deep dive"', `hero_subtitle: "${"s".repeat(401)}"`)));
    expect(s.join(" ")).toContain("The hero subtitle for module-2 is too long (max 400 letters).");
  });

  it("blocks two group discounts with the same code", () => {
    const front = FRONT.replace("  prices:", "  tiers:\n    - { key: g3, label: A, size: 3, percent_off: 10 }\n    - { key: g3, label: B, size: 4, percent_off: 12 }\n  prices:");
    expect(errs(file(front)).join(" ")).toContain('Two group discounts use the same code "g3"');
  });

  it("warns plainly when values would be cut or clamped", () => {
    const front = FRONT
      .replace("currency: AED", "currency: DIRHAM")
      .replace("  prices:", `  ref_prefix: ABCDEFGH\n  verify_whatsapp: "${"9".repeat(21)}"\n  tiers:\n    - { key: g3, label: Big, size: 3, percent_off: 95 }\n  prices:`);
    const msgs = ok(file(front)).warnings.map((w) => w.message).join(" | ");
    expect(msgs).toContain("is not a 3-letter code");
    expect(msgs).toContain("longer than 6 characters");
    expect(msgs).toContain("longer than 20 digits");
    expect(msgs).toContain("lowered to 90%");
  });

  it("warns when there are more than 12 countries or options, or 6 group discounts", () => {
    const regions = Array.from({ length: 13 }, (_, i) => `    - { code: C${String.fromCharCode(65 + i)}, name: N${i}, currency: AED }`).join("\n");
    const options = Array.from({ length: 13 }, (_, i) => `    - { key: o${i}, name: O${i}, kind: bundle }`).join("\n");
    const tiers = Array.from({ length: 7 }, (_, i) => `    - { key: t${i}, label: T${i}, size: ${i + 2}, percent_off: 5 }`).join("\n");
    const front = `format: pz-landing/1\nkind: course\ntitle: Big\nregistration:\n  regions:\n${regions}\n  options:\n${options}\n  tiers:\n${tiers}\n`;
    const r = buildImport(file(front));
    const msgs = (r.ok ? r.built.warnings.map((w) => w.message) : r.errors).join(" | ");
    expect(msgs).toContain("13 countries; only the first 12");
    expect(msgs).toContain("13 options; only the first 12");
    expect(msgs).toContain("7 group discounts; only the first 6");
  });
});
