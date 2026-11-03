import { describe, expect, it } from "vitest";
import { SECTION_DEFS, defaultSectionData, normalizeSectionData } from "@/lib/landing/sections";

const person = (n: number, extra: Record<string, unknown> = {}) => ({ name: `Fake ${n}`, role: "Title", bio: "Bio", photo: "", ...extra });

describe("instructors data", () => {
  it("a new instructors section defaults to layout a", () => {
    expect(defaultSectionData("instructors").layout).toBe("a");
  });

  it("a stored section with no layout normalizes to classic", () => {
    expect(normalizeSectionData("instructors", { heading: "H", items: [person(1)] }).layout).toBe("classic");
  });

  it("layouts a, b and classic survive normalization and an unknown one falls back to a", () => {
    for (const v of ["a", "b", "classic"]) {
      expect(normalizeSectionData("instructors", { layout: v, items: [person(1)] }).layout).toBe(v);
    }
    expect(normalizeSectionData("instructors", { layout: "zzz", items: [person(1)] }).layout).toBe("a");
  });

  it("credentials is kept per person and capped at 600 characters", () => {
    const out = normalizeSectionData("instructors", { layout: "a", items: [person(1, { credentials: "- One\n- Two" }), person(2, { credentials: "x".repeat(601) })] });
    const items = out.items as Record<string, unknown>[];
    expect(items[0].credentials).toBe("- One\n- Two");
    expect(items[1].credentials).toBe("");
    const max = SECTION_DEFS.instructors.fields.find((f) => f.key === "items")!.itemFields!.find((f) => f.key === "credentials")!.max;
    expect(max).toBe(600);
  });

  it("a stored person with no credentials normalizes to an empty string", () => {
    const items = normalizeSectionData("instructors", { items: [person(1)] }).items as Record<string, unknown>[];
    expect(items[0].credentials).toBe("");
  });

  it("at most 8 people are kept", () => {
    const items = normalizeSectionData("instructors", { layout: "a", items: Array.from({ length: 12 }, (_, i) => person(i)) }).items as unknown[];
    expect(items).toHaveLength(8);
  });
});
