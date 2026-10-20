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
  it("contains the unsubscribe url", () => {
    expect(buildParticipantHtml({ bodyText: "x", unsubscribeUrl: url })).toContain(url);
  });
});
