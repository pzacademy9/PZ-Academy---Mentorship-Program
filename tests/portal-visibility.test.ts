// tests/portal-visibility.test.ts
import { describe, it, expect } from "vitest";
import { isPortalVisible, isPortalSwitchOn } from "@/lib/progress/visibility";

const base = { status: "published", showInPortal: null as boolean | null, kind: "course", enrolled: false };

describe("isPortalVisible", () => {
  it("automatic (null): published and closed are shown, a draft stays private even with students", () => {
    expect(isPortalVisible(base)).toBe(true);
    expect(isPortalVisible({ ...base, status: "closed" })).toBe(true);
    expect(isPortalVisible({ ...base, status: "draft" })).toBe(false);
    expect(isPortalVisible({ ...base, status: "draft", enrolled: true })).toBe(false);
    for (const kind of ["workshop", "webinar"]) expect(isPortalVisible({ ...base, kind })).toBe(true);
  });
  it("switched on (true): a draft shows only once it has students", () => {
    expect(isPortalVisible({ ...base, showInPortal: true, status: "draft", enrolled: true })).toBe(true);
    expect(isPortalVisible({ ...base, showInPortal: true, status: "draft", enrolled: false })).toBe(false);
    expect(isPortalVisible({ ...base, showInPortal: true })).toBe(true);
  });
  it("switched off (false) hides everything", () => {
    expect(isPortalVisible({ ...base, showInPortal: false })).toBe(false);
    expect(isPortalVisible({ ...base, showInPortal: false, status: "draft", enrolled: true })).toBe(false);
  });
  it("is hidden for other kinds", () => {
    expect(isPortalVisible({ ...base, showInPortal: true, kind: "page", enrolled: true })).toBe(false);
  });
});

describe("isPortalSwitchOn", () => {
  it("shows the effective state", () => {
    expect(isPortalSwitchOn("published", null)).toBe(true);
    expect(isPortalSwitchOn("closed", undefined)).toBe(true);
    expect(isPortalSwitchOn("draft", null)).toBe(false);
    expect(isPortalSwitchOn("draft", true)).toBe(true);
    expect(isPortalSwitchOn("published", false)).toBe(false);
  });
});
