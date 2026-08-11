import { describe, it, expect } from "vitest";
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from "@/lib/social-platforms";

describe("detectSocialPlatform", () => {
  it("recognizes each supported platform, with or without www.", () => {
    expect(detectSocialPlatform("https://www.linkedin.com/in/x")).toBe("linkedin");
    expect(detectSocialPlatform("https://x.com/x")).toBe("x");
    expect(detectSocialPlatform("https://twitter.com/x")).toBe("x");
    expect(detectSocialPlatform("https://www.instagram.com/x")).toBe("instagram");
    expect(detectSocialPlatform("https://youtu.be/x")).toBe("youtube");
    expect(detectSocialPlatform("https://www.facebook.com/x")).toBe("facebook");
    expect(detectSocialPlatform("https://github.com/x")).toBe("github");
  });

  it("matches subdomains of a known host", () => {
    expect(detectSocialPlatform("https://m.facebook.com/x")).toBe("facebook");
  });

  it("returns null for unrecognized hosts, so callers fall back to the admin-entered label", () => {
    expect(detectSocialPlatform("https://hamzaansari.com")).toBeNull();
    expect(detectSocialPlatform("https://wa.me/923001234567")).toBeNull();
  });

  it("returns null instead of throwing on a malformed URL", () => {
    expect(detectSocialPlatform("not a url")).toBeNull();
  });

  it("has a display label for every platform it can detect", () => {
    expect(SOCIAL_PLATFORM_LABELS.linkedin).toBe("LinkedIn");
    expect(SOCIAL_PLATFORM_LABELS.x).toBe("X");
    expect(SOCIAL_PLATFORM_LABELS.instagram).toBe("Instagram");
    expect(SOCIAL_PLATFORM_LABELS.youtube).toBe("YouTube");
    expect(SOCIAL_PLATFORM_LABELS.facebook).toBe("Facebook");
    expect(SOCIAL_PLATFORM_LABELS.github).toBe("GitHub");
  });
});
