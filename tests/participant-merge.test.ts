import { describe, it, expect } from "vitest";
import { firstNameOf } from "@/lib/crm/whatsapp-link";
import { renderParticipantTags, usesPortalLink, PARTICIPANT_TAGS } from "@/lib/landing/participants/merge";

const ctx = { name: "Dr Sara Khan", refId: "PZ-123", portalUrl: "https://x.test/p/abc", pzId: "Hamid-4821" };

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
  it("renders pz_id, or nothing when the recipient has no person yet", () => {
    expect(renderParticipantTags("Your ID: {{pz_id}}", ctx, "text")).toBe("Your ID: Hamid-4821");
    expect(renderParticipantTags("Your ID: {{pz_id}}", { ...ctx, pzId: "" }, "text")).toBe("Your ID: ");
    expect(PARTICIPANT_TAGS).toContain("pz_id");
  });
  it("exposes tags and usesPortalLink", () => {
    expect(PARTICIPANT_TAGS).toContain("portal_link");
    expect(usesPortalLink("x {{ portal_link }}")).toBe(true);
    expect(usesPortalLink("x {{ ref_id }}")).toBe(false);
  });
});

describe("renderParticipantTags session tags", () => {
  const session = { zoomUrl: "https://zoom.test/j/1", kahootUrl: "", timeText: "Sat 14 Nov, 8:00 pm PKT", attendanceUrl: "https://x.test/attend/abc?t=1" };
  it("fills zoom_link, kahoot_link, session_time and attendance_link; an omitted link is empty", () => {
    expect(renderParticipantTags("{{zoom_link}}|{{kahoot_link}}|{{session_time}}|{{attendance_link}}", { ...ctx, session }, "text")).toBe(
      "https://zoom.test/j/1||Sat 14 Nov, 8:00 pm PKT|https://x.test/attend/abc?t=1",
    );
  });
  it("leaves them verbatim when there is no session", () => {
    expect(renderParticipantTags("{{zoom_link}} {{ attendance_link }}", ctx, "text")).toBe("{{zoom_link}} {{ attendance_link }}");
  });
});
