import { describe, it, expect } from "vitest";
import { summarizeStarValues } from "@/lib/data/mentor-reviews";

// getMentorReviewSummary/listMentorReviews are DB-touching (createAdminSupabase),
// and this repo's convention is pure-function unit tests only — no DB mocking
// (see average()/clampStar() in validations/feedback.ts). summarizeStarValues
// is the pure aggregation core both functions build on, so it's tested here
// directly instead of the DB-touching wrappers.
describe("summarizeStarValues", () => {
  it("returns an empty summary for no responses", () => {
    expect(summarizeStarValues([])).toEqual({
      avg: null,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("skips a response with zero star answers", () => {
    expect(summarizeStarValues([[]])).toEqual({
      avg: null,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
  });

  it("averages a single response's multiple star answers before bucketing", () => {
    // 5 and 4 average to 4.5, rounds to 5 for the distribution bucket.
    const result = summarizeStarValues([[5, 4]]);
    expect(result.count).toBe(1);
    expect(result.avg).toBe(4.5);
    expect(result.distribution[5]).toBe(1);
  });

  it("computes the overall avg as the mean of each response's own avg, rounded to one decimal", () => {
    // Response A: avg 5. Response B: avg 3. Response C: avg 4.
    // Overall = (5 + 3 + 4) / 3 = 4.0
    const result = summarizeStarValues([[5], [3], [4]]);
    expect(result.avg).toBe(4);
    expect(result.count).toBe(3);
  });

  it("buckets each response into its rounded-average star, clamped to 1..5", () => {
    const result = summarizeStarValues([[5, 5], [3], [1], [4, 5]]);
    // [5,5] -> 5, [3] -> 3, [1] -> 1, [4,5] -> 4.5 rounds to 5
    expect(result.distribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 2 });
    expect(result.count).toBe(4);
  });

  it("rounds .5 averages up via Math.round when bucketing (banker's-rounding-free)", () => {
    // 2 and 3 average to 2.5 -> Math.round(2.5) = 3
    const result = summarizeStarValues([[2, 3]]);
    expect(result.distribution[3]).toBe(1);
  });

  it("mixes multi-question responses with single-question responses correctly", () => {
    const result = summarizeStarValues([[5, 5, 5], [2], [4, 3]]);
    // avgs: 5, 2, 3.5 -> overall = (5 + 2 + 3.5) / 3 = 3.5
    expect(result.avg).toBe(3.5);
    expect(result.count).toBe(3);
  });
});
