import { describe, it, expect } from "vitest";
import { sanitizeLessonHtml } from "@/lib/sanitize-html";

describe("sanitizeLessonHtml", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeLessonHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("Hello");
  });

  it("strips on* event handler attributes", () => {
    const out = sanitizeLessonHtml('<img src="x.png" onerror="alert(1)" />');
    expect(out).not.toContain("onerror");
  });

  it("strips javascript: URLs from links", () => {
    const out = sanitizeLessonHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain("javascript:");
  });

  it("keeps the allowed formatting tags Tiptap's toolbar produces", () => {
    const out = sanitizeLessonHtml(
      "<p><strong>bold</strong> <em>italic</em> <u>underline</u></p><ul><li>item</li></ul>",
    );
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
    expect(out).toContain("<u>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
  });

  it("keeps safe links and images", () => {
    const out = sanitizeLessonHtml(
      '<a href="https://example.com">link</a><img src="https://example.com/a.png" alt="a" />',
    );
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('src="https://example.com/a.png"');
  });
});
