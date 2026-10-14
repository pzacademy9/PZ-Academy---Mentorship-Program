// tests/landing-templates.test.ts
import { describe, it, expect } from "vitest";
import { TEMPLATES, buildTemplate } from "@/lib/landing/templates";
import { clearReview, computeReadiness, contentSchema } from "@/lib/landing/content";

describe("templates", () => {
  it("lists blank templates for every kind plus the three seeded pages", () => {
    const ids = TEMPLATES.map((t) => t.id);
    for (const id of ["blank-course", "blank-workshop", "blank-webinar", "ppc-batch-3", "mdc-batch-3", "w20-diabetes"]) expect(ids).toContain(id);
  });
  it("every template builds content that passes the API schema", () => {
    for (const t of TEMPLATES) {
      const c = buildTemplate(t.id, t.kind);
      expect(c, t.id).not.toBeNull();
      expect(contentSchema.safeParse(c).success, t.id).toBe(true);
    }
  });
  it("seeded templates flag their old dates and prices until the admin edits or keeps them", () => {
    for (const id of ["ppc-batch-3", "mdc-batch-3", "w20-diabetes"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const c = buildTemplate(id, t.kind)!;
      expect(c.needsReview.length, id).toBeGreaterThan(0);
      const review = computeReadiness(c, { title: t.label, slug: id }).problems.filter((p) => p.review);
      expect(review.length, id).toBeGreaterThan(0);
      for (const p of review) expect(p.message, id).toMatch(/^Update the event dates and prices in /);
    }
  });
  it("PPC and MDC are publishable once their flagged fields are kept", () => {
    for (const id of ["ppc-batch-3", "mdc-batch-3"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const c = buildTemplate(id, t.kind)!;
      expect(computeReadiness(clearReview(c, c.needsReview), { title: t.label, slug: id }).problems, id).toEqual([]);
    }
  });
  it("every flag points at a real text field of a section in the built page (ids remapped)", () => {
    for (const t of TEMPLATES) {
      const c = buildTemplate(t.id, t.kind)!;
      for (const p of c.needsReview) {
        const at = p.indexOf(":");
        const s = c.sections.find((x) => x.id === p.slice(0, at));
        expect(s, p).toBeTruthy();
        const v = p.slice(at + 1).split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], s!.data);
        expect(typeof v, p).toBe("string");
      }
    }
  });
  it("PPC and MDC show one set of price cards, never Early Bird and regular side by side", () => {
    for (const id of ["ppc-batch-3", "mdc-batch-3"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const pricing = buildTemplate(id, t.kind)!.sections.find((s) => s.type === "pricing_cards")!;
      const names = (pricing.data.items as { name: string }[]).map((i) => i.name);
      expect(names.filter((n) => /early bird/i.test(n)), id).toEqual([]);
    }
  });
  it("seeded template descriptions say to update the dates before publishing", () => {
    for (const id of ["ppc-batch-3", "mdc-batch-3", "w20-diabetes"]) {
      expect(TEMPLATES.find((x) => x.id === id)!.description, id).toMatch(/Update the dates and prices before publishing\./);
    }
  });
  it("W20 ships with a blank Register link so readiness blocks publish until the admin sets one", () => {
    const t = TEMPLATES.find((x) => x.id === "w20-diabetes")!;
    const c = buildTemplate(t.id, t.kind)!;
    expect(c.settings.registerUrl).toBe("");
    const r = computeReadiness(c, { title: t.label, slug: t.id });
    expect(r.ready).toBe(false);
    expect(r.problems.some((p) => /Register button/i.test(p.message))).toBe(true);
  });
  it("gives fresh section ids on every build", () => {
    const a = buildTemplate("ppc-batch-3", "course")!;
    const b = buildTemplate("ppc-batch-3", "course")!;
    expect(a.sections[0].id).not.toBe(b.sections[0].id);
  });
  it("returns null for an unknown id or a kind mismatch", () => {
    expect(buildTemplate("nope", "course")).toBeNull();
    expect(buildTemplate("ppc-batch-3", "webinar")).toBeNull();
  });
  it("seeded copy comes from the real pages", () => {
    const ppc = buildTemplate("ppc-batch-3", "course")!;
    const text = JSON.stringify(ppc);
    expect(text).toMatch(/Practical Pharmacology/i);
    expect(ppc.settings.registerUrl).toMatch(/^https:\/\//);
  });
});
