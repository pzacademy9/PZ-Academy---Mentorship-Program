import { describe, it, expect } from "vitest";
import { renderMergeTags } from "@/lib/crm/merge-tags";
import { buildCampaignHtml } from "@/lib/crm/campaign-email";

describe("renderMergeTags", () => {
  it("substitutes first_name from the first word of the full name", () => {
    expect(renderMergeTags("Hi {{first_name}},", { fullName: "Areeba Fatima", email: "a@x.com" })).toBe("Hi Areeba,");
  });

  it("substitutes full_name and email", () => {
    expect(renderMergeTags("{{full_name}} <{{email}}>", { fullName: "Areeba Fatima", email: "a@x.com" }))
      .toBe("Areeba Fatima <a@x.com>");
  });

  it("falls back to a neutral greeting when the name is missing", () => {
    // "Hi ," in three thousand emails is exactly the kind of defect that only
    // shows up in production, so the fallback is tested, not assumed.
    expect(renderMergeTags("Hi {{first_name}},", { fullName: "", email: "a@x.com" })).toBe("Hi there,");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(renderMergeTags("Hi {{ first_name }}!", { fullName: "Amna Nasir", email: null })).toBe("Hi Amna!");
  });

  it("leaves an unknown tag untouched rather than blanking it", () => {
    expect(renderMergeTags("{{course_name}}", { fullName: "X Y", email: null })).toBe("{{course_name}}");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(renderMergeTags("{{first_name}} {{first_name}}", { fullName: "Amna Nasir", email: null })).toBe("Amna Amna");
  });

  it("escapes HTML in substituted values", () => {
    // Names come from spreadsheets typed by hand. An unescaped angle bracket
    // would break the email layout at best.
    expect(renderMergeTags("Hi {{first_name}}", { fullName: "<script>x</script>", email: null }))
      .toBe("Hi &lt;script&gt;x&lt;/script&gt;");
  });
});

describe("buildCampaignHtml", () => {
  it("always embeds the unsubscribe URL", () => {
    const html = buildCampaignHtml({ bodyHtml: "<p>Hello</p>", unsubscribeUrl: "https://pz.test/unsubscribe/abc" });
    expect(html).toContain("https://pz.test/unsubscribe/abc");
    expect(html).toContain("Unsubscribe");
  });

  it("embeds the body", () => {
    const html = buildCampaignHtml({ bodyHtml: "<p>Hello</p>", unsubscribeUrl: "https://pz.test/u/1" });
    expect(html).toContain("<p>Hello</p>");
  });

  it("produces a complete HTML document", () => {
    const html = buildCampaignHtml({ bodyHtml: "x", unsubscribeUrl: "https://pz.test/u/1" });
    expect(html.trim().startsWith("<!DOCTYPE html>")).toBe(true);
  });
});
