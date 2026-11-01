// tests/portal-visibility.test.ts
import { describe, it, expect } from "vitest";
import { isPortalVisible } from "@/lib/progress/visibility";

const base = { status: "published", showInPortal: true, kind: "course", enrolled: false };

describe("isPortalVisible", () => {
  it("shows published and closed batches of a portal kind", () => {
    expect(isPortalVisible(base)).toBe(true);
    expect(isPortalVisible({ ...base, status: "closed" })).toBe(true);
    for (const kind of ["workshop", "webinar"]) expect(isPortalVisible({ ...base, kind })).toBe(true);
  });
  it("shows a draft only when it has enrolled students", () => {
    expect(isPortalVisible({ ...base, status: "draft", enrolled: true })).toBe(true);
    expect(isPortalVisible({ ...base, status: "draft", enrolled: false })).toBe(false);
  });
  it("is hidden when the switch is off, whatever else is true", () => {
    expect(isPortalVisible({ ...base, showInPortal: false })).toBe(false);
    expect(isPortalVisible({ ...base, status: "draft", enrolled: true, showInPortal: false })).toBe(false);
  });
  it("is hidden for other kinds", () => {
    expect(isPortalVisible({ ...base, kind: "page", enrolled: true })).toBe(false);
  });
});
