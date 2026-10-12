// tests/landing-templates.test.ts
import { describe, it, expect } from "vitest";
import { TEMPLATES, buildTemplate } from "@/lib/landing/templates";
import { computeReadiness, contentSchema } from "@/lib/landing/content";

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
  it("seeded templates are publishable once they have a slug and title", () => {
    for (const id of ["ppc-batch-3", "mdc-batch-3", "w20-diabetes"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const r = computeReadiness(buildTemplate(id, t.kind)!, { title: t.label, slug: id });
      expect(r.problems, id).toEqual([]);
    }
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
