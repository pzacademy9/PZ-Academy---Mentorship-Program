// tests/landing-content.test.ts
import { describe, it, expect } from "vitest";
import {
  emptyContent, normalizeContent, addSection, removeSection, moveSection, toggleSection,
  updateSectionData, computeReadiness, hasUnpublishedChanges, contentSchema, KIND_SECTIONS,
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
