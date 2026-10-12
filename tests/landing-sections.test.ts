// tests/landing-sections.test.ts
import { describe, it, expect } from "vitest";
import {
  SECTION_TYPES, SECTION_DEFS, defaultSectionData, sectionDataSchema, normalizeSectionData,
} from "@/lib/landing/sections";

describe("section registry", () => {
  it("every type has a def with a unique key per field", () => {
    for (const t of SECTION_TYPES) {
      const keys = SECTION_DEFS[t].fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(SECTION_DEFS[t].label.length).toBeGreaterThan(0);
    }
  });
  it("default data passes its own schema for every type", () => {
    for (const t of SECTION_TYPES) {
      const r = sectionDataSchema(t).safeParse(defaultSectionData(t));
      expect(r.success, t).toBe(true);
    }
  });
  it("hero defaults the primary button label", () => {
    expect(defaultSectionData("hero").primaryCtaLabel).toBe("Register now");
  });
});

describe("normalizeSectionData (never throws)", () => {
  it("fills missing fields with defaults", () => {
    const d = normalizeSectionData("hero", { headline: "Hi" });
    expect(d.headline).toBe("Hi");
    expect(d.primaryCtaLabel).toBe("Register now");
  });
  it("drops unknown keys", () => {
    expect(normalizeSectionData("faq", { heading: "Q", evil: "x" })).not.toHaveProperty("evil");
  });
  it("replaces a wrong-typed field with its default", () => {
    expect(normalizeSectionData("hero", { headline: 123 }).headline).toBe("");
    expect(normalizeSectionData("faq", { items: "nope" }).items).toEqual([]);
  });
  it("replaces an unsafe url with empty", () => {
    expect(normalizeSectionData("hero", { image: "javascript:alert(1)" }).image).toBe("");
    expect(normalizeSectionData("hero", { secondaryCtaUrl: "javascript:alert(1)" }).secondaryCtaUrl).toBe("");
  });
  it("normalizes list items individually", () => {
    const d = normalizeSectionData("faq", { items: [{ q: "A?", a: "B" }, { q: 5, a: null }, "junk"] });
    expect(d.items).toEqual([
      { q: "A?", a: "B" },
      { q: "", a: "" },
      { q: "", a: "" },
    ]);
  });
  it("survives null and non-object input", () => {
    expect(() => normalizeSectionData("hero", null)).not.toThrow();
    expect(() => normalizeSectionData("hero", "x")).not.toThrow();
  });
  it("caps list length at maxItems", () => {
    const many = Array.from({ length: 500 }, () => ({ q: "q", a: "a" }));
    expect((normalizeSectionData("faq", { items: many }).items as unknown[]).length).toBeLessThanOrEqual(40);
  });
});

describe("schema validation (API side)", () => {
  it("rejects an unsafe link", () => {
    expect(sectionDataSchema("hero").safeParse({ ...defaultSectionData("hero"), secondaryCtaUrl: "javascript:x" }).success).toBe(false);
  });
  it("accepts an incomplete draft (required is a publish rule, not a save rule)", () => {
    expect(sectionDataSchema("hero").safeParse(defaultSectionData("hero")).success).toBe(true);
  });
});
