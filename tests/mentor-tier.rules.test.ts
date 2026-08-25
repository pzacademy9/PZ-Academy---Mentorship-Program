import { describe, it, expect } from "vitest";
import {
  computeMentorTier,
  partitionByFeaturedTier,
  shouldRenderFeaturedStrip,
  isFeaturedTier,
  MENTOR_TIERS,
  type MentorTier,
} from "@/lib/mentor-tier";

describe("computeMentorTier", () => {
  it("scores a brand-new mentor (no reviews, no sessions) as standard", () => {
    const result = computeMentorTier({ ratingAvg: null, reviewCount: 0, sessionCount: 0 });
    expect(result.tier).toBe("standard");
  });

  it("damps a single 5-star review below a volume-backed 4.6 average", () => {
    const oneReview = computeMentorTier({ ratingAvg: 5.0, reviewCount: 1, sessionCount: 0 });
    const manyReviews = computeMentorTier({ ratingAvg: 4.6, reviewCount: 20, sessionCount: 0 });
    expect(oneReview.tier).toBe("standard");
    expect(oneReview.score).toBeLessThan(manyReviews.score);
  });

  it("is non-decreasing in reviewCount at a fixed above-prior rating", () => {
    const fewer = computeMentorTier({ ratingAvg: 4.8, reviewCount: 3, sessionCount: 10 });
    const more = computeMentorTier({ ratingAvg: 4.8, reviewCount: 15, sessionCount: 10 });
    expect(more.score).toBeGreaterThanOrEqual(fewer.score);
  });

  it("is non-decreasing in sessionCount at fixed reviews", () => {
    const fewer = computeMentorTier({ ratingAvg: 4.8, reviewCount: 10, sessionCount: 5 });
    const more = computeMentorTier({ ratingAvg: 4.8, reviewCount: 10, sessionCount: 30 });
    expect(more.score).toBeGreaterThanOrEqual(fewer.score);
  });

  it("caps account-less mentors (sessionCount 0) at premium regardless of rating/reviews", () => {
    for (const ratingAvg of [3, 3.5, 4, 4.5, 5]) {
      for (const reviewCount of [0, 1, 5, 20, 100]) {
        const result = computeMentorTier({ ratingAvg, reviewCount, sessionCount: 0 });
        expect(result.score).toBeLessThanOrEqual(75);
        expect(["standard", "premium"]).toContain(result.tier);
      }
    }
  });

  it("saturates the experience term at 40 completed sessions", () => {
    const at40 = computeMentorTier({ ratingAvg: 5.0, reviewCount: 40, sessionCount: 40 });
    const at400 = computeMentorTier({ ratingAvg: 5.0, reviewCount: 40, sessionCount: 400 });
    expect(at40.score).toBe(at400.score);
  });

  it("reaches each tier at a representative input", () => {
    const table: [MentorTier, { ratingAvg: number | null; reviewCount: number; sessionCount: number }][] = [
      ["standard", { ratingAvg: null, reviewCount: 0, sessionCount: 0 }],
      ["premium", { ratingAvg: 5.0, reviewCount: 3, sessionCount: 5 }],
      ["platinum", { ratingAvg: 4.8, reviewCount: 20, sessionCount: 30 }],
      ["elite", { ratingAvg: 5.0, reviewCount: 40, sessionCount: 60 }],
    ];
    for (const [expectedTier, inputs] of table) {
      expect(computeMentorTier(inputs).tier).toBe(expectedTier);
    }
  });

  it("treats a non-null rating with zero reviews as no evidence", () => {
    const withBadCount = computeMentorTier({ ratingAvg: 4.9, reviewCount: 0, sessionCount: 0 });
    const noEvidence = computeMentorTier({ ratingAvg: null, reviewCount: 0, sessionCount: 0 });
    expect(withBadCount.score).toBe(noEvidence.score);
  });

  it("clamps an out-of-range rating average to 5", () => {
    const clamped = computeMentorTier({ ratingAvg: 9, reviewCount: 10, sessionCount: 0 });
    const atMax = computeMentorTier({ ratingAvg: 5, reviewCount: 10, sessionCount: 0 });
    expect(clamped.score).toBe(atMax.score);
  });

  it("clamps negative counts to zero", () => {
    const negative = computeMentorTier({ ratingAvg: 4.5, reviewCount: -5, sessionCount: -10 });
    const zero = computeMentorTier({ ratingAvg: 4.5, reviewCount: 0, sessionCount: 0 });
    expect(negative.score).toBe(zero.score);
  });

  it("is pure — identical inputs give identical results", () => {
    const inputs = { ratingAvg: 4.7, reviewCount: 12, sessionCount: 18 };
    expect(computeMentorTier(inputs)).toEqual(computeMentorTier(inputs));
  });
});

describe("partitionByFeaturedTier", () => {
  it("splits platinum+elite from premium+standard and preserves order in both halves", () => {
    const mentors = [
      { id: "a", tier: "standard" as MentorTier },
      { id: "b", tier: "platinum" as MentorTier },
      { id: "c", tier: "premium" as MentorTier },
      { id: "d", tier: "elite" as MentorTier },
    ];
    const { featured, rest } = partitionByFeaturedTier(mentors);
    expect(featured.map((m) => m.id)).toEqual(["b", "d"]);
    expect(rest.map((m) => m.id)).toEqual(["a", "c"]);
  });
});

describe("isFeaturedTier", () => {
  it("is true only for platinum and elite", () => {
    const table: [MentorTier, boolean][] = [
      ["standard", false],
      ["premium", false],
      ["platinum", true],
      ["elite", true],
    ];
    for (const [tier, expected] of table) {
      expect(isFeaturedTier(tier)).toBe(expected);
    }
  });
});

describe("shouldRenderFeaturedStrip", () => {
  it("is false when no mentor is featured", () => {
    expect(shouldRenderFeaturedStrip(0, 5)).toBe(false);
  });

  it("is false when every mentor is featured (would empty the grid)", () => {
    expect(shouldRenderFeaturedStrip(5, 5)).toBe(false);
  });

  it("is true when some but not all mentors are featured", () => {
    expect(shouldRenderFeaturedStrip(2, 5)).toBe(true);
  });

  it("is false for an empty registry", () => {
    expect(shouldRenderFeaturedStrip(0, 0)).toBe(false);
  });
});

describe("MENTOR_TIERS", () => {
  it("is declared low to high, matching the DB enum declaration order", () => {
    expect(MENTOR_TIERS).toEqual(["standard", "premium", "platinum", "elite"]);
  });
});
