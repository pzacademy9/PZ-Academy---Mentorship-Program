import { describe, it, expect } from "vitest";
import {
  isMentorPubliclyVisible,
  isMentorListedPublicly,
  isKnownPackageName,
  mentorPackageWarnings,
  formatSessionDuration,
  type MentorVisibility,
} from "@/lib/validations/admin-mentor";
import { slugify } from "@/lib/validations/admin-lms";

describe("isMentorPubliclyVisible", () => {
  it("is true only for published", () => {
    const table: [MentorVisibility, boolean][] = [
      ["published", true],
      ["draft", false],
      ["hidden", false],
    ];
    for (const [visibility, expected] of table) {
      expect(isMentorPubliclyVisible(visibility)).toBe(expected);
    }
  });
});

describe("isMentorListedPublicly", () => {
  it("is true only for published", () => {
    const table: [MentorVisibility, boolean][] = [
      ["published", true],
      ["draft", false],
      ["hidden", false],
    ];
    for (const [visibility, expected] of table) {
      expect(isMentorListedPublicly(visibility)).toBe(expected);
    }
  });
});

describe("isKnownPackageName", () => {
  const packages = [
    { name: "Single Session" },
    { name: "3-Session Pack" },
  ];

  it("is true for an exact match", () => {
    expect(isKnownPackageName(packages, "Single Session")).toBe(true);
  });

  it("is false for a case-different match", () => {
    expect(isKnownPackageName(packages, "single session")).toBe(false);
  });

  it("is false for a whitespace-padded match", () => {
    expect(isKnownPackageName(packages, " Single Session ")).toBe(false);
  });

  it("is false once the package has been removed", () => {
    const afterEdit = packages.filter((p) => p.name !== "Single Session");
    expect(isKnownPackageName(afterEdit, "Single Session")).toBe(false);
  });

  it("is false for an empty package list", () => {
    expect(isKnownPackageName([], "Single Session")).toBe(false);
  });
});

describe("mentorPackageWarnings", () => {
  const seededDrRohaPackages = [
    { name: "Single Session", sessions: 1, price: 3500 },
    { name: "3-Session Pack", sessions: 3, price: 9500, savings: 1000 },
    { name: "5-Session Pack", sessions: 5, price: 15500, savings: 2000 },
  ];

  it("returns no warnings for the seeded dr-roha shape", () => {
    expect(mentorPackageWarnings(seededDrRohaPackages, 3500)).toEqual([]);
  });

  it("warns when the 1-session package price doesn't match pricePerSessionPkr", () => {
    const warnings = mentorPackageWarnings(
      [{ name: "Single Session", sessions: 1, price: 4000 }],
      3500,
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("warns when savings is not less than price", () => {
    const warnings = mentorPackageWarnings(
      [{ name: "Bad Pack", sessions: 3, price: 9000, savings: 9000 }],
      3000,
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("warns when a multi-session pack costs more than paying per-session individually", () => {
    const warnings = mentorPackageWarnings(
      [{ name: "Overpriced Pack", sessions: 3, price: 20000 }],
      3500,
    );
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("formatSessionDuration", () => {
  it("formats plural minute counts", () => {
    expect(formatSessionDuration(60)).toBe("60 Minutes");
    expect(formatSessionDuration(90)).toBe("90 Minutes");
  });

  it("formats a singular minute", () => {
    expect(formatSessionDuration(1)).toBe("1 Minute");
  });
});

describe("slugify applied to mentor names (documents seeded-slug immutability)", () => {
  it("produces the expected slug shape", () => {
    expect(slugify("Dr. Roha")).toBe("dr-roha");
  });

  /**
   * The seeded slug for this mentor is "laiq-ur-rehman" (see
   * 0028_mentor_registry.sql), NOT what slugify(name) produces today.
   * Recomputing a mentor's slug from its name would silently rename it and
   * orphan every historical booking (mentor_slug has no FK) — this test
   * documents that seeded slugs are historical and must never be
   * recomputed, by asserting the two values actually differ.
   */
  it("differs from the historical seeded slug for Laiq-Ur-Rehman Khan", () => {
    expect(slugify("Laiq-Ur-Rehman Khan")).toBe("laiq-ur-rehman-khan");
    expect(slugify("Laiq-Ur-Rehman Khan")).not.toBe("laiq-ur-rehman");
  });
});
