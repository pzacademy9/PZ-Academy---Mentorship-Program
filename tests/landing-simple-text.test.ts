// tests/landing-simple-text.test.ts
import { describe, it, expect } from "vitest";
import { isSafeUrl, youtubeId, parseSimpleText } from "@/lib/landing/simple-text";

describe("isSafeUrl", () => {
  it.each(["https://a.com/x", "http://a.com", "mailto:a@b.com", "tel:+923001234567", "#registration", "/e/ppc-b3"])(
    "accepts %s", (u) => expect(isSafeUrl(u)).toBe(true));
  it.each(["", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "//evil.com", "vbscript:x", "ftp://a.com", "not a url",
    "/\\evil.com", "/\t/evil.com", " javascript:alert(1)", "java\nscript:alert(1)"])(
    "rejects %s", (u) => expect(isSafeUrl(u)).toBe(false));
});

describe("youtubeId", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts from %s", (u, id) => expect(youtubeId(u)).toBe(id));
  it.each(["", "https://vimeo.com/123", "https://youtube.com/watch?v=short", "javascript:alert(1)", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"])(
    "returns null for %s", (u) => expect(youtubeId(u)).toBeNull());
});

describe("parseSimpleText", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(parseSimpleText("Line one\nstill one\n\nSecond")).toEqual([
      { t: "p", inline: [{ t: "text", v: "Line one still one" }] },
      { t: "p", inline: [{ t: "text", v: "Second" }] },
    ]);
  });
  it("groups '- ' lines into one list", () => {
    expect(parseSimpleText("- a\n- b")).toEqual([
      { t: "ul", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] },
    ]);
  });
  it("parses bold and safe links", () => {
    const [p] = parseSimpleText("Hi **there** [site](https://a.com)");
    expect(p).toEqual({ t: "p", inline: [
      { t: "text", v: "Hi " }, { t: "bold", v: "there" }, { t: "text", v: " " },
      { t: "link", v: "site", href: "https://a.com" },
    ] });
  });
  it("renders an unsafe link as plain text, never as a link", () => {
    const [p] = parseSimpleText("[click](javascript:alert(1))");
    expect(JSON.stringify(p)).not.toContain('"t":"link"');
    expect(JSON.stringify(p)).toContain("click");
  });
  it("renders a backslash-relative link as plain text", () => {
    const [p] = parseSimpleText("[x](/\\evil.com)");
    expect(JSON.stringify(p)).not.toContain('"t":"link"');
  });
  it("keeps HTML as literal text", () => {
    const [p] = parseSimpleText("<script>alert(1)</script>");
    expect(p).toEqual({ t: "p", inline: [{ t: "text", v: "<script>alert(1)</script>" }] });
  });
  it("returns [] for empty or whitespace input", () => {
    expect(parseSimpleText("")).toEqual([]);
    expect(parseSimpleText("  \n \n")).toEqual([]);
  });
});
