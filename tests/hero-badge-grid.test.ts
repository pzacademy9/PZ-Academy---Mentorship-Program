import { describe, expect, it } from "vitest";
import { badgeGridClass } from "@/components/landing/sections/Hero";

describe("badgeGridClass", () => {
  it("never leaves a lone highlight on a second row", () => {
    expect(badgeGridClass(4)).toContain("grid-cols-2");
    expect(badgeGridClass(4)).toContain("lg:grid-cols-4");
    expect(badgeGridClass(4)).not.toContain("sm:grid-cols-3");
  });
  it("lines three highlights up in one row from tablet, one tidy column on phones", () => {
    expect(badgeGridClass(3)).toContain("grid-cols-1");
    expect(badgeGridClass(3)).toContain("sm:grid-cols-3");
  });
  it("handles one, two and many", () => {
    expect(badgeGridClass(1)).toContain("grid-cols-1");
    expect(badgeGridClass(2)).toContain("sm:grid-cols-2");
    expect(badgeGridClass(6)).toContain("sm:grid-cols-3");
  });
});
