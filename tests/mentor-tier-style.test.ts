import { describe, it, expect } from "vitest";
import { mentorTierStyle, resolvePublicMentorTierStyle } from "@/lib/mentor-tier-style";
import { MENTOR_TIERS, MENTOR_TIER_LABELS } from "@/lib/mentor-tier";

describe("resolvePublicMentorTierStyle", () => {
  it("returns null for standard — the default floor never renders a public badge", () => {
    expect(resolvePublicMentorTierStyle("standard")).toBeNull();
  });

  it("returns a non-null style with all brand fields set for premium/platinum/elite", () => {
    for (const tier of ["premium", "platinum", "elite"] as const) {
      const style = resolvePublicMentorTierStyle(tier);
      expect(style).not.toBeNull();
      expect(style!.label.length).toBeGreaterThan(0);
      expect(style!.brand.background).toMatch(/^#/);
      expect(style!.brand.color).toMatch(/^#/);
      expect(style!.brand.border).toMatch(/^#/);
    }
  });
});

describe("mentorTierStyle", () => {
  it("returns a style for all four tiers, including standard", () => {
    for (const tier of MENTOR_TIERS) {
      const style = mentorTierStyle(tier);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.className.length).toBeGreaterThan(0);
    }
  });
});

describe("MENTOR_TIER_LABELS", () => {
  it("has an entry for every MENTOR_TIERS member", () => {
    for (const tier of MENTOR_TIERS) {
      expect(MENTOR_TIER_LABELS[tier]).toBeTruthy();
    }
  });
});
