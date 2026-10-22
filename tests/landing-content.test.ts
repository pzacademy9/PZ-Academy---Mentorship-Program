// tests/landing-content.test.ts
import { describe, it, expect } from "vitest";
import {
  emptyContent, normalizeContent, addSection, removeSection, moveSection, toggleSection,
  updateSectionData, updateSettings, computeReadiness, hasUnpublishedChanges, contentSchema, KIND_SECTIONS,
} from "@/lib/landing/content";

const ids = (c: ReturnType<typeof emptyContent>) => c.sections.map((s) => s.id);

describe("emptyContent", () => {
  it("starts every kind with a hero and uses the kind's section list", () => {
    for (const kind of ["course", "workshop", "webinar"] as const) {
      const c = emptyContent(kind);
      expect(c.sections[0].type).toBe("hero");
      expect(c.sections.map((s) => s.type)).toEqual(KIND_SECTIONS[kind]);
      expect(new Set(ids(c)).size).toBe(c.sections.length);
    }
  });
  it("passes the API schema", () => {
    expect(contentSchema.safeParse(emptyContent("course")).success).toBe(true);
  });
});

describe("normalizeContent", () => {
  it("drops unknown section types and fills defaults", () => {
    const c = normalizeContent({ sections: [{ id: "a", type: "nope", enabled: true, data: {} }, { id: "b", type: "faq", enabled: true, data: { heading: "H" } }] });
    expect(c.sections.map((s) => s.type)).toEqual(["faq"]);
    expect(c.settings.registerLabel).toBe("Register now");
    expect(c.seo.title).toBe("");
  });
  it("survives null, strings and garbage", () => {
    for (const bad of [null, undefined, "x", 5, [], { sections: "no" }]) {
      expect(() => normalizeContent(bad)).not.toThrow();
      expect(normalizeContent(bad).sections).toEqual([]);
    }
  });
  it("assigns an id to a section that has none and removes duplicate ids", () => {
    const c = normalizeContent({ sections: [{ type: "faq", enabled: true, data: {} }, { id: "x", type: "faq", enabled: true, data: {} }, { id: "x", type: "faq", enabled: true, data: {} }] });
    expect(new Set(ids(c)).size).toBe(3);
  });
});

describe("operations are immutable and safe at the edges", () => {
  const base = emptyContent("webinar");
  it("moveSection swaps neighbours and no-ops at the ends", () => {
    const second = base.sections[1].id;
    const moved = moveSection(base, second, -1);
    expect(moved.sections[0].id).toBe(second);
    expect(ids(moveSection(base, base.sections[0].id, -1))).toEqual(ids(base));
    expect(ids(moveSection(base, base.sections[base.sections.length - 1].id, 1))).toEqual(ids(base));
    expect(ids(base)[1]).toBe(second); // original untouched
  });
  it("moveSection ignores an unknown id", () => {
    expect(ids(moveSection(base, "nope", 1))).toEqual(ids(base));
  });
  it("toggleSection flips enabled only for that section", () => {
    const id = base.sections[2].id;
    const t = toggleSection(base, id);
    expect(t.sections[2].enabled).toBe(!base.sections[2].enabled);
    expect(t.sections[1].enabled).toBe(base.sections[1].enabled);
  });
  it("addSection inserts at the index (default end) with default data", () => {
    const a = addSection(base, "stats", 1);
    expect(a.sections[1].type).toBe("stats");
    expect(addSection(base, "stats").sections.at(-1)?.type).toBe("stats");
  });
  it("removeSection removes by id", () => {
    const id = base.sections[0].id;
    expect(removeSection(base, id).sections.find((s) => s.id === id)).toBeUndefined();
  });
  it("updateSectionData normalizes the data it stores", () => {
    const id = base.sections[0].id;
    const u = updateSectionData(base, id, { headline: "Hello", junk: 1 });
    expect(u.sections[0].data.headline).toBe("Hello");
    expect(u.sections[0].data).not.toHaveProperty("junk");
  });
});

describe("computeReadiness", () => {
  const page = { title: "PPC Batch 4", slug: "ppc-b4" };
  it("is not ready for a blank page and speaks plainly", () => {
    const r = computeReadiness(emptyContent("course"), page);
    expect(r.ready).toBe(false);
    expect(r.problems.some((p) => /headline/i.test(p.message))).toBe(true);
    expect(r.problems.some((p) => /register/i.test(p.message) && /link/i.test(p.message))).toBe(true);
    expect(r.problems.some((p) => /description/i.test(p.message))).toBe(true);
  });
  it("attaches the section id so the UI can jump to it", () => {
    const c = emptyContent("webinar");
    const r = computeReadiness(c, page);
    const heroProblem = r.problems.find((p) => /headline/i.test(p.message));
    expect(heroProblem?.sectionId).toBe(c.sections[0].id);
  });
  it("ignores disabled sections", () => {
    let c = emptyContent("webinar");
    for (const s of c.sections) if (s.type !== "hero") c = toggleSection(c, s.id);
    const r = computeReadiness(c, page);
    expect(r.problems.every((p) => !p.sectionId || p.sectionId === c.sections[0].id)).toBe(true);
  });
  it("is ready when every required thing is filled", () => {
    let c = emptyContent("webinar");
    for (const s of c.sections) if (s.type !== "hero") c = removeSection(c, s.id);
    c = updateSectionData(c, c.sections[0].id, { headline: "Diabetes webinar" });
    c = { ...c, settings: { ...c.settings, registerUrl: "https://pharmacozyme.com/register" }, seo: { ...c.seo, description: "A one hour webinar." } };
    expect(computeReadiness(c, page)).toEqual({ ready: true, problems: [] });
  });
  it("flags a list item missing its required field by position", () => {
    let c = emptyContent("webinar");
    const faq = c.sections.find((s) => s.type === "faq")!;
    c = updateSectionData(c, faq.id, { items: [{ q: "Q1", a: "A1" }, { q: "", a: "A2" }] });
    const r = computeReadiness(c, page);
    expect(r.problems.some((p) => p.sectionId === faq.id && /2/.test(p.message))).toBe(true);
  });
  it("rejects a bad slug, a bad register link, a bad WhatsApp number and a bad countdown date", () => {
    let c = emptyContent("webinar");
    c = { ...c, settings: { ...c.settings, registerUrl: "javascript:x", whatsappNumber: "12", countdownTo: "not a date" } };
    const msgs = computeReadiness(c, { title: "x", slug: "api" }).problems.map((p) => p.message).join("|");
    expect(msgs).toMatch(/reserved|different/i);
    expect(msgs).toMatch(/Register button/i);
    expect(msgs).toMatch(/WhatsApp/i);
    expect(msgs).toMatch(/countdown/i);
  });
});

describe("hasUnpublishedChanges", () => {
  it("is true when never published", () => expect(hasUnpublishedChanges(emptyContent("course"), null)).toBe(true));
  it("is false for identical content and true after an edit", () => {
    const a = emptyContent("course");
    expect(hasUnpublishedChanges(a, structuredClone(a))).toBe(false);
    expect(hasUnpublishedChanges(updateSectionData(a, a.sections[0].id, { headline: "x" }), a)).toBe(true);
  });
});

describe("register link must be an absolute http(s) URL", () => {
  const page = { title: "PPC Batch 4", slug: "ppc-b4" };
  const withUrl = (registerUrl: string) => computeReadiness(updateSettings(emptyContent("webinar"), { registerUrl }), page).problems.some((p) => /Register button/i.test(p.message));
  it("flags dead or non-web links", () => {
    for (const bad of ["#", "/x", "mailto:a@b.com", ""]) expect(withUrl(bad)).toBe(true);
  });
  it("accepts a real https link", () => expect(withUrl("https://pharmacozyme.com/register")).toBe(false));
});

describe("contentSchema rejects bad input", () => {
  const ok = () => emptyContent("webinar");
  it("accepts the happy path", () => expect(contentSchema.safeParse(ok()).success).toBe(true));
  it("rejects duplicate section ids", () => {
    const c = ok();
    c.sections[1].id = c.sections[0].id;
    expect(contentSchema.safeParse(c).success).toBe(false);
  });
  it("rejects an unsafe hero image", () => {
    const c = ok();
    c.sections[0].data = { ...c.sections[0].data, image: "javascript:alert(1)" };
    expect(contentSchema.safeParse(c).success).toBe(false);
  });
  it("rejects an unknown section type", () => {
    const c = ok() as unknown as { sections: { type: string }[] };
    c.sections[0].type = "nope";
    expect(contentSchema.safeParse(c).success).toBe(false);
  });
  it("rejects 41 sections", () => {
    const c = ok();
    c.sections = Array.from({ length: 41 }, (_, i) => ({ ...c.sections[0], id: `s${i}` }));
    expect(contentSchema.safeParse(c).success).toBe(false);
  });
  it("rejects an unsafe register link", () => {
    expect(contentSchema.safeParse(updateSettings(ok(), { registerUrl: "javascript:x" })).success).toBe(false);
  });
  it("rejects a batchStartsOn over 40 characters", () => {
    expect(contentSchema.safeParse(updateSettings(ok(), { batchStartsOn: "x".repeat(41) })).success).toBe(false);
    expect(contentSchema.safeParse(updateSettings(ok(), { batchStartsOn: "2026-10-30T14:30:00.000Z" })).success).toBe(true);
  });
});

describe("batchStartsOn setting", () => {
  it("is kept when valid", () => {
    const c = normalizeContent({ settings: { batchStartsOn: "2026-10-30T14:30:00.000Z" } });
    expect(c.settings.batchStartsOn).toBe("2026-10-30T14:30:00.000Z");
  });
  it("defaults to empty for old saved pages", () => {
    expect(normalizeContent({ settings: { registerLabel: "Go" } }).settings.batchStartsOn).toBe("");
    expect(emptyContent("course").settings.batchStartsOn).toBe("");
  });
});

import { clearReview } from "@/lib/landing/content";

describe("needsReview (template flags)", () => {
  const page = { title: "PPC Batch 4", slug: "ppc-b4" };
  const flaggedHero = () => {
    let c = emptyContent("webinar");
    for (const s of c.sections) if (s.type !== "hero") c = removeSection(c, s.id);
    const hero = c.sections[0];
    c = updateSectionData(c, hero.id, { headline: "Diabetes webinar", dateLine: "16th September 2026", eyebrow: "LIVE" });
    c = updateSettings(c, { registerUrl: "https://pharmacozyme.com/register" });
    c = { ...c, seo: { ...c.seo, description: "A one hour webinar." }, needsReview: [`${hero.id}:dateLine`, `${hero.id}:eyebrow`] };
    return { c, hero };
  };

  it("defaults to an empty list and keeps only string paths when loading", () => {
    expect(emptyContent("course").needsReview).toEqual([]);
    expect(normalizeContent({ sections: [] }).needsReview).toEqual([]);
    expect(normalizeContent({ sections: [], needsReview: ["a:headline", 42, null] }).needsReview).toEqual(["a:headline"]);
  });
  it("survives the save schema (not stripped by the PATCH parse)", () => {
    const { c } = flaggedHero();
    expect(normalizeContent(contentSchema.parse(c)).needsReview).toEqual(c.needsReview);
  });
  it("blocks publishing with one plain problem per section that jumps to the first flagged field", () => {
    const { c, hero } = flaggedHero();
    const r = computeReadiness(c, page);
    expect(r.ready).toBe(false);
    const p = r.problems.find((x) => x.review)!;
    expect(p.message).toMatch(/^Update the event dates and prices in "Hero \(top of page\)": 2 fields still show/);
    expect(p.sectionId).toBe(hero.id);
    expect(p.field).toBe("dateLine");
    expect(p.review).toEqual([`${hero.id}:dateLine`, `${hero.id}:eyebrow`]);
  });
  it("editing a flagged field clears only that flag", () => {
    const { c, hero } = flaggedHero();
    const next = updateSectionData(c, hero.id, { ...hero.data, headline: "Diabetes webinar", dateLine: "20th October 2026", eyebrow: "LIVE" });
    expect(next.needsReview).toEqual([`${hero.id}:eyebrow`]);
  });
  it("editing another field keeps the flags", () => {
    const { c, hero } = flaggedHero();
    const next = updateSectionData(c, hero.id, { headline: "New headline", dateLine: "16th September 2026", eyebrow: "LIVE" });
    expect(next.needsReview).toEqual(c.needsReview);
  });
  it("clearReview removes the given paths, and then the page is ready", () => {
    const { c } = flaggedHero();
    const kept = clearReview(c, c.needsReview);
    expect(kept.needsReview).toEqual([]);
    expect(computeReadiness(kept, page)).toEqual({ ready: true, problems: [] });
  });
  it("ignores flags of hidden or deleted sections and of list items that no longer exist", () => {
    const { c, hero } = flaggedHero();
    expect(computeReadiness(toggleSection(c, hero.id), page).problems.some((p) => p.review)).toBe(false);
    const gone = { ...c, needsReview: ["no-such-section:headline", `${hero.id}:badges.5.text`] };
    expect(computeReadiness(gone, page).problems.some((p) => p.review)).toBe(false);
  });
});

describe("needsReview survives list edits (L5 fix)", () => {
  const mk = () => {
    let c = emptyContent("course");
    const sec = c.sections.find((s) => s.type === "schedule")!;
    const items = [0, 1, 2, 3].map((n) => ({ when: `Day ${n}`, title: `T${n}`, detail: `D${n}` }));
    c = updateSectionData(c, sec.id, { heading: "Schedule", items });
    c = { ...c, needsReview: items.map((_, n) => `${sec.id}:items.${n}.when`) };
    return { c, id: sec.id, items };
  };
  it("deleting item 0 moves the other flags down and drops only item 0's", () => {
    const { c, id, items } = mk();
    const next = updateSectionData(c, id, { heading: "Schedule", items: items.slice(1) });
    expect(next.needsReview).toEqual([`${id}:items.0.when`, `${id}:items.1.when`, `${id}:items.2.when`]);
  });
  it("reordering keeps each flag on its moved item", () => {
    const { c, id, items } = mk();
    const next = updateSectionData(c, id, { heading: "Schedule", items: [items[1], items[0], items[2], items[3]] });
    expect([...next.needsReview].sort()).toEqual([0, 1, 2, 3].map((n) => `${id}:items.${n}.when`));
    const next2 = updateSectionData(c, id, { heading: "Schedule", items: [items[3], items[0], items[1], items[2]] });
    expect(next2.needsReview).toEqual([`${id}:items.1.when`, `${id}:items.2.when`, `${id}:items.3.when`, `${id}:items.0.when`]);
  });
  it("editing one flagged value in place clears only that flag", () => {
    const { c, id, items } = mk();
    const edited = items.map((it, n) => (n === 2 ? { ...it, when: "New day" } : it));
    const next = updateSectionData(c, id, { heading: "Schedule", items: edited });
    expect(next.needsReview).toEqual([`${id}:items.0.when`, `${id}:items.1.when`, `${id}:items.3.when`]);
  });
  it("PPC: deleting the first schedule item still blocks publishing", async () => {
    const { buildTemplate } = await import("@/lib/landing/templates");
    const c = buildTemplate("ppc-batch-3", "course")!;
    const sec = c.sections.find((s) => s.type === "schedule")!;
    const items = sec.data.items as Record<string, unknown>[];
    const next = updateSectionData(c, sec.id, { ...sec.data, items: items.slice(1) });
    expect(next.needsReview.filter((p) => p.startsWith(`${sec.id}:`))).toHaveLength(3);
    const r = computeReadiness(next, { title: "PPC", slug: "ppc-b4" });
    expect(r.problems.some((p) => p.review && p.sectionId === sec.id)).toBe(true);
  });
});

// ------------------------------------------------------------- modules
import { defaultSectionData, sectionDataSchema } from "@/lib/landing/sections";
import { MODULE_ITEM_SECTIONS, MODULE_KEY_RE, type ModuleDef } from "@/lib/landing/variants";

const mod = (key: string, over: Partial<ModuleDef> = {}): ModuleDef => ({ key, title: `Title ${key}`, format: "3-Day Workshop", days: 3, optionKey: "", ...over });

describe("modules", () => {
  it("normalizeContent of a document without modules returns []", () => {
    expect(normalizeContent({ sections: [] }).modules).toEqual([]);
    expect(emptyContent("course").modules).toEqual([]);
  });
  it("normalizeContent drops invalid keys, duplicates and the 13th module", () => {
    const many = Array.from({ length: 14 }, (_, i) => mod(`module-${i + 1}`));
    expect(normalizeContent({ modules: many }).modules).toHaveLength(12);
    const c = normalizeContent({ modules: [mod("Module 2"), mod("module-1"), "junk"] });
    expect(c.modules.map((m) => m.key)).toEqual(["module-1"]);
  });
  it("contentSchema rejects invalid module keys and a 13th module", () => {
    const base = emptyContent("course");
    expect(contentSchema.safeParse({ ...base, modules: [mod("module-1")] }).success).toBe(true);
    expect(contentSchema.safeParse({ ...base, modules: [mod("Module 2")] }).success).toBe(false);
    expect(contentSchema.safeParse({ ...base, modules: Array.from({ length: 13 }, (_, i) => mod(`m-${i}`)) }).success).toBe(false);
    expect(MODULE_KEY_RE.test("module-2")).toBe(true);
  });
  it("module-tagged sections get an item default of module ''", () => {
    expect(MODULE_ITEM_SECTIONS).toContain("curriculum");
    const d = defaultSectionData("curriculum");
    expect(d.items).toEqual([]);
    const norm = normalizeContent({ sections: [{ id: "a", type: "curriculum", enabled: true, data: { items: [{ title: "T" }] } }] });
    expect((norm.sections[0].data.items as { module: string }[])[0].module).toBe("");
  });
  it("old items without module still pass sectionDataSchema", () => {
    expect(sectionDataSchema("curriculum").safeParse({ heading: "H", items: [{ title: "T", subtitle: "", points: "" }] }).success).toBe(true);
    expect(sectionDataSchema("curriculum").safeParse({ heading: "H", items: [{ title: "T", subtitle: "", points: "", module: "" }] }).success).toBe(true);
  });
});

describe("module readiness", () => {
  const ready = () => {
    const c = emptyContent("course");
    c.registration = { ...c.registration, regions: [{ key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] }], options: [{ key: "mod-2", label: "Module 2", kind: "module", free: false, waGroupUrl: "", moduleIds: [] }], prices: { "mod-2": { PK: { amount: 100 } } } };
    return c;
  };
  const msgs = (c: ReturnType<typeof emptyContent>) => computeReadiness(c, { title: "T", slug: "a-page" }).problems.map((p) => p.message);
  it("reports duplicate module keys", () => {
    const c = ready();
    c.modules = [mod("module-1"), mod("module-1")];
    expect(msgs(c).some((m) => m.includes("same code") && m.includes("module-1"))).toBe(true);
  });
  it("reports an optionKey missing from registration.options", () => {
    const c = ready();
    c.modules = [mod("module-1", { title: "Pharmacology", optionKey: "ghost" })];
    expect(msgs(c).some((m) => m.includes("Pharmacology") && m.includes("no longer exists"))).toBe(true);
  });
  it("reports a module option with no price in a region", () => {
    const c = ready();
    c.registration.regions.push({ key: "UAE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] });
    c.modules = [mod("module-2", { title: "Module Two", optionKey: "mod-2" })];
    expect(msgs(c)).toContain("Module Two has no price for UAE.");
    expect(msgs(c).some((m) => m.includes("for Pakistan"))).toBe(false);
  });
  it("reports a region code that collides with a module code or STATUS", () => {
    const c = ready();
    c.registration.regions.push({ key: "MODULE-2", label: "Odd", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] });
    c.modules = [mod("module-2", { title: "Module Two", optionKey: "mod-2" })];
    expect(msgs(c).some((m) => m.includes("MODULE-2") && m.includes("module"))).toBe(true);
    const d = ready();
    d.registration.regions.push({ key: "STATUS", label: "Odd", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] });
    expect(msgs(d).some((m) => m.includes("STATUS"))).toBe(true);
  });
});

// ------------------------------------------------------------- linked price cards
describe("price card readiness", () => {
  const PK = { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] };
  const PH = { key: "PH", label: "Philippines", currency: "PHP", classTime: "", timezoneLabel: "", accountKeys: [] };
  const withCards = (items: Record<string, unknown>[], enabled: boolean) => {
    const c = emptyContent("course");
    c.registration = {
      ...c.registration, enabled, modes: ["live"], regions: [PK, PH], defaultRegionKey: "PK",
      options: [
        { key: "full", label: "Complete Course", kind: "bundle", free: false, waGroupUrl: "", moduleIds: [] },
        { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: "", moduleIds: [] },
      ],
      prices: { full: { PK: { amount: 4000 }, PH: { amount: 4000 } }, m2: { PK: { amount: 1000 } } },
    };
    const sec = c.sections.find((s) => s.type === "pricing_cards")!;
    sec.data = { ...sec.data, items };
    return { c, sec };
  };
  const card = (name: string, option: string, price = "") => ({ name, option, price, oldPrice: "", badge: "", features: "" });
  const probs = (c: ReturnType<typeof emptyContent>) => computeReadiness(c, { title: "T", slug: "a-page" }).problems;

  it("normalizeContent keeps the option key", () => {
    const { c } = withCards([card("A", "full")], true);
    const n = normalizeContent(JSON.parse(JSON.stringify(c)));
    const items = n.sections.find((s) => s.type === "pricing_cards")!.data.items as { option: string }[];
    expect(items[0].option).toBe("full");
    const old = normalizeContent({ sections: [{ id: "a", type: "pricing_cards", enabled: true, data: { items: [{ name: "A", price: "1" }] } }] });
    expect((old.sections[0].data.items as { option: string }[])[0].option).toBe("");
  });
  it("(a) registration off, linked, no typed price", () => {
    const { c, sec } = withCards([card("Complete Course", "full")], false);
    const p = probs(c).filter((x) => x.message.includes("has no price to show"));
    expect(p).toHaveLength(1);
    expect(p[0].message).toBe('The card "Complete Course" has no price to show. Switch the registration form on or type a price.');
    expect(p[0].sectionId).toBe(sec.id);
    expect(probs(c).some((x) => x.message.includes("needs \"Price\""))).toBe(false);
  });
  it("(b) registration on, linked to a deleted option", () => {
    const { c } = withCards([card("X", "ghost")], true);
    expect(probs(c).map((p) => p.message)).toContain('The card "X" is linked to something that no longer exists.');
  });
  it("(c) registration on, option with no price in a country: the card check adds no duplicate line", () => {
    const { c } = withCards([card("Two", "m2")], true);
    expect(probs(c).map((p) => p.message)).not.toContain("Module 2 has no price for Philippines.");
  });
  it("(d) fully priced linked card and unlinked cards give no card problem", () => {
    const { c } = withCards([card("Complete Course", "full"), card("Typed", "", "PKR 100")], true);
    const m = probs(c).map((p) => p.message);
    expect(m.some((x) => x.includes("The card") || x.includes("has no price"))).toBe(false);
    expect(m.some((x) => x.includes("needs \"Price\""))).toBe(false);
  });
  it("unlinked card with no price is still required", () => {
    const { c } = withCards([card("Typed", "")], true);
    expect(probs(c).some((x) => x.message.includes('needs "Price"'))).toBe(true);
  });
});
