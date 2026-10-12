// tests/landing-slug.test.ts
import { describe, it, expect } from "vitest";
import { slugify, validateSlug, RESERVED_SLUGS } from "@/lib/landing/slug";

describe("slugify", () => {
  it.each([
    ["PPC Batch 3", "ppc-batch-3"],
    ["  Practical   Pharmacology — Batch #4!! ", "practical-pharmacology-batch-4"],
    ["Café Crème", "cafe-creme"],
    ["---x---", "x"],
  ])("%s -> %s", (i, o) => expect(slugify(i)).toBe(o));
  it("returns '' for a name with no latin letters or digits", () => {
    expect(slugify("دورة")).toBe("");
  });
  it("caps at 60 chars with no trailing dash", () => {
    const s = slugify("a".repeat(59) + " b");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("accepts a normal slug", () => expect(validateSlug("ppc-b4")).toEqual({ ok: true }));
  it.each(["ab", "PPC-B4", "has space", "-x-", "a--b", "x".repeat(61), ""])("rejects %j", (s) => {
    expect(validateSlug(s).ok).toBe(false);
  });
  it.each([...RESERVED_SLUGS])("rejects reserved word %s", (s) => {
    const r = validateSlug(s.length >= 3 ? s : s + "xx");
    if (s.length >= 3) expect(r.ok).toBe(false);
  });
  it("gives a plain-language message", () => {
    const r = validateSlug("api");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/reserved|taken|different/i);
  });
});
