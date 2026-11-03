import { describe, expect, it } from "vitest";
import { contentSchema, emptyContent, hasUnpublishedChanges, normalizeContent } from "@/lib/landing/content";
import { resolveTerms, termsBlocks } from "@/lib/landing/terms";
import { isReservedSegment, parseVariantPath } from "@/lib/landing/variants";

describe("resolveTerms", () => {
  it("prefers page text, then general text, then null", () => {
    expect(resolveTerms("Page text", "General text")).toEqual({ text: "Page text", source: "page" });
    expect(resolveTerms("", "General text")).toEqual({ text: "General text", source: "general" });
    expect(resolveTerms(undefined, "General text")).toEqual({ text: "General text", source: "general" });
    expect(resolveTerms("  \n ", "General text")).toEqual({ text: "General text", source: "general" });
    expect(resolveTerms("", "")).toBeNull();
    expect(resolveTerms(undefined, "   ")).toBeNull();
  });
});

describe("termsBlocks", () => {
  it("turns numbered one-line paragraphs into headings and keeps other paragraphs", () => {
    const text = "1. Payment and refunds\nFees are fake and final.\n\n2. Access\n\nSessions are on a fake platform.\n\nQuestions? Message us.";
    const out = termsBlocks(text);
    expect(out).toEqual([
      { kind: "p", text: "1. Payment and refunds\nFees are fake and final." },
      { kind: "heading", text: "2. Access" },
      { kind: "p", text: "Sessions are on a fake platform." },
      { kind: "p", text: "Questions? Message us." },
    ]);
  });

  it("a numbered title on its own line is a heading", () => {
    expect(termsBlocks("1. Payment and refunds\n\nBody text.")).toEqual([
      { kind: "heading", text: "1. Payment and refunds" },
      { kind: "p", text: "Body text." },
    ]);
  });

  it("handles Windows line endings and extra blank lines", () => {
    expect(termsBlocks("1. One\r\n\r\n\r\n\r\nBody\r\nline two\r\n\r\n")).toEqual([
      { kind: "heading", text: "1. One" },
      { kind: "p", text: "Body\nline two" },
    ]);
    expect(termsBlocks("   \n\n ")).toEqual([]);
  });
});

describe("the terms address is reserved", () => {
  it("a country or module link can not be called terms", () => {
    expect(isReservedSegment("terms")).toBe(true);
    expect(isReservedSegment("status")).toBe(true);
    expect(parseVariantPath(["terms"], emptyContent("course"))).toBeNull();
  });
});

describe("settings.terms", () => {
  it("a page saved without terms normalizes with empty terms and stays unchanged", () => {
    const old = { settings: { registerUrl: "", registerLabel: "Join" }, seo: {}, sections: [] };
    const a = normalizeContent(old);
    expect(a.settings.terms).toBe("");
    expect(hasUnpublishedChanges(normalizeContent(old), normalizeContent(old))).toBe(false);
    expect(normalizeContent(a)).toEqual(a);
  });

  it("keeps the text the owner pasted", () => {
    const c = normalizeContent({ settings: { terms: "1. Fake rule\n\nFake text" } });
    expect(c.settings.terms).toBe("1. Fake rule\n\nFake text");
  });

  it("contentSchema accepts 20000 characters and rejects 20001", () => {
    const base = emptyContent("course");
    expect(contentSchema.safeParse({ ...base, settings: { ...base.settings, terms: "a".repeat(20000) } }).success).toBe(true);
    expect(contentSchema.safeParse({ ...base, settings: { ...base.settings, terms: "a".repeat(20001) } }).success).toBe(false);
  });

  it("content without the terms key still passes the schema", () => {
    const base = emptyContent("course");
    const { terms: _t, ...settings } = base.settings;
    void _t;
    expect(contentSchema.safeParse({ ...base, settings }).success).toBe(true);
  });
});
