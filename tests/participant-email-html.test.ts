import { describe, it, expect } from "vitest";
import { buildParticipantHtml } from "@/lib/landing/participants/email-html";

const url = "https://pz.test/unsubscribe/participants/abc";

describe("buildParticipantHtml", () => {
  it("escapes html in the body", () => {
    const html = buildParticipantHtml({ bodyText: "<script>alert(1)</script>", unsubscribeUrl: url });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("turns https links into anchors and newlines into br", () => {
    const html = buildParticipantHtml({ bodyText: "Hi\nSee https://x.com/z now", unsubscribeUrl: url });
    expect(html).toContain('<a href="https://x.com/z"');
    expect(html).toContain("Hi<br>See");
  });
  it("keeps escaped quotes, brackets and punctuation outside the link", () => {
    const a = buildParticipantHtml({ bodyText: "'https://x.com/a'", unsubscribeUrl: url });
    expect(a).toContain('<a href="https://x.com/a">https://x.com/a</a>&#39;');
    const b = buildParticipantHtml({ bodyText: '"https://x.com/a"', unsubscribeUrl: url });
    expect(b).toContain('<a href="https://x.com/a">https://x.com/a</a>&quot;');
    const c = buildParticipantHtml({ bodyText: "<https://x.com/a>", unsubscribeUrl: url });
    expect(c).toContain('<a href="https://x.com/a">https://x.com/a</a>&gt;');
    const d = buildParticipantHtml({ bodyText: "See https://x.com/a.", unsubscribeUrl: url });
    expect(d).toContain('<a href="https://x.com/a">https://x.com/a</a>.');
    const e = buildParticipantHtml({ bodyText: "(https://x.com/a&b=1).", unsubscribeUrl: url });
    expect(e).toContain('<a href="https://x.com/a&amp;b=1">https://x.com/a&amp;b=1</a>).');
  });
  it("contains the unsubscribe url", () => {
    expect(buildParticipantHtml({ bodyText: "x", unsubscribeUrl: url })).toContain(url);
  });
});
