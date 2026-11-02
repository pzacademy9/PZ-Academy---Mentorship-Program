import { describe, it, expect } from "vitest";
import { pickPortalUrl, desiredEnrollment } from "@/lib/landing/registration/access-rules";
import { emptyContent, normalizeContent } from "@/lib/landing/content";

const APP = "https://app.example.com";
const paidRecorded = desiredEnrollment({
  status: "paid", mode: "recorded", hasCourse: true, isTest: false, moduleIds: [], finishedModuleIds: [],
});
const base = {
  courseSlug: null as string | null, hasAccount: false, desired: paidRecorded,
  mode: "recorded" as const, status: "paid" as const, pastedLink: "https://portal.example.com/x", appUrl: APP,
};

describe("pickPortalUrl", () => {
  it("returns the course portal for a recorded paid buyer with an account", () => {
    expect(pickPortalUrl({ ...base, courseSlug: "ppc", hasAccount: true })).toBe(`${APP}/portal/ppc`);
  });
  it("returns the pasted link for a recorded paid buyer on a page with no course", () => {
    expect(pickPortalUrl(base)).toBe("https://portal.example.com/x");
  });
  it("returns undefined for a live buyer on a page with no course even when a link is pasted", () => {
    expect(pickPortalUrl({ ...base, mode: "live" })).toBeUndefined();
  });
  it("returns undefined for an unpaid recorded buyer", () => {
    expect(pickPortalUrl({ ...base, status: "reserved" })).toBeUndefined();
  });
  it("ignores an unsafe pasted link (javascript:)", () => {
    expect(pickPortalUrl({ ...base, pastedLink: "javascript:alert(1)" })).toBeUndefined();
  });
});

describe("portalLink setting", () => {
  it("normalizeContent keeps a valid portalLink and blanks an invalid one", () => {
    expect(normalizeContent({ settings: { portalLink: "https://a.example.com/p" } }).settings.portalLink).toBe("https://a.example.com/p");
    expect(normalizeContent({ settings: { portalLink: "javascript:alert(1)" } }).settings.portalLink).toBe("");
  });
  it("default settings have portalLink \"\"", () => {
    expect(emptyContent("course").settings.portalLink).toBe("");
  });
});
