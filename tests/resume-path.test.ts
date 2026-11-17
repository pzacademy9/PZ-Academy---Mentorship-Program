import { describe, it, expect } from "vitest";
import {
  RESUME_KEY,
  RESUME_HOME,
  isRememberablePath,
  pickResumeTarget,
} from "@/lib/resume-path";

describe("constants", () => {
  it("uses the agreed values", () => {
    expect(RESUME_KEY).toBe("pz:last-portal-path");
    expect(RESUME_HOME).toBe("/dashboard");
  });
});

describe("isRememberablePath", () => {
  it.each([
    "/dashboard",
    "/dashboard/admin/landing-promo-codes",
    "/dashboard/courses?x=1#top",
    "/dashboard?tab=2",
  ])("accepts %s", (p) => {
    expect(isRememberablePath(p)).toBe(true);
  });

  it.each([
    "",
    "/",
    "/login",
    "/dashboard/../login",
    "//evil.com",
    "/dashboard//evil.com",
    "https://x/dashboard",
    "/\\evil",
    "javascript:alert(1)",
    "/dashboard\\x",
    "/dashboards",
    "/dashboard/%2F%2Fevil.com",
    "/dashboard/%2f%2fevil.com",
    "/dashboard/..%2Flogin",
    "/dashboard/%5Cevil",
    "/dashboard/%5cevil",
    "/dashboard/%2E%2E/login",
    "/dashboard/%2e%2e/login",
    "/dashboard/a\nb",
    "/dashboard/a\u0000b",
    "/dashboard/a\u007fb",
    "/dashboard/" + "a".repeat(500),
  ])("rejects %j", (p) => {
    expect(isRememberablePath(p)).toBe(false);
  });

  it("accepts exactly 500 chars", () => {
    const p = "/dashboard/" + "a".repeat(489);
    expect(p.length).toBe(500);
    expect(isRememberablePath(p)).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(isRememberablePath(undefined as unknown as string)).toBe(false);
    expect(isRememberablePath(null as unknown as string)).toBe(false);
  });
});

describe("pickResumeTarget", () => {
  it.each([null, undefined, ""])("falls back for %j", (v) => {
    expect(pickResumeTarget(v)).toBe("/dashboard");
  });

  it("returns a good saved path unchanged", () => {
    expect(pickResumeTarget("/dashboard/courses?x=1#top")).toBe(
      "/dashboard/courses?x=1#top",
    );
  });

  it.each(["//evil.com", "https://x", "/\\evil", "javascript:alert(1)", "/dashboard/%2F%2Fevil.com"])(
    "falls back for hostile %s",
    (v) => {
      expect(pickResumeTarget(v)).toBe("/dashboard");
    },
  );
});
