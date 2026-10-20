import { describe, it, expect } from "vitest";
import { firstNameOf } from "@/lib/crm/whatsapp-link";
import { renderParticipantTags, usesPortalLink, PARTICIPANT_TAGS } from "@/lib/landing/participants/merge";

const ctx = { name: "Dr Sara Khan", refId: "PZ-123", portalUrl: "https://x.test/p/abc" };

describe("renderParticipantTags", () => {
  it("renders first_name via firstNameOf", () => {
    expect(renderParticipantTags("Hi {{ first_name }}", ctx, "text")).toBe(`Hi ${firstNameOf(ctx.name)}`);
  });
  it("falls back to there for blank name", () => {
    expect(renderParticipantTags("Hi {{first_name}}", { ...ctx, name: "  " }, "text")).toBe("Hi there");
  });
  it("renders full_name, ref_id and portal_link", () => {
    expect(renderParticipantTags("{{full_name}}|{{ref_id}}|{{ portal_link }}", ctx, "text")).toBe(
      "Dr Sara Khan|PZ-123|https://x.test/p/abc",
    );
  });
  it("blank name gives empty full_name", () => {
    expect(renderParticipantTags("[{{full_name}}]", { ...ctx, name: "  " }, "text")).toBe("[]");
  });
  it("leaves unknown tags verbatim", () => {
    expect(renderParticipantTags("{{ zoom }}", ctx, "text")).toBe("{{ zoom }}");
  });
  it("escapes in html mode only", () => {
    const c = { ...ctx, name: "<b>X</b>" };
    expect(renderParticipantTags("{{full_name}}", c, "html")).toBe("&lt;b&gt;X&lt;/b&gt;");
    expect(renderParticipantTags("{{full_name}}", c, "text")).toBe("<b>X</b>");
  });
  it("null portalUrl renders empty", () => {
    expect(renderParticipantTags("[{{portal_link}}]", { ...ctx, portalUrl: null }, "text")).toBe("[]");
  });
  it("exposes tags and usesPortalLink", () => {
    expect(PARTICIPANT_TAGS).toContain("portal_link");
    expect(usesPortalLink("x {{ portal_link }}")).toBe(true);
    expect(usesPortalLink("x {{ ref_id }}")).toBe(false);
  });
});
