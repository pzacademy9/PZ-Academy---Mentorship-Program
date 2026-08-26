import { describe, it, expect } from "vitest";
import { getMentorReviewSummary, getMentorReviewSummaries } from "@/lib/data/mentor-reviews";

// summarizeStarValues (the pure per-response-average reducer this file used
// to test) was removed in migration 0046: its logic now lives in the
// mentor_review_stats SQL function so results can't be silently truncated
// by PostgREST's db-max-rows cap. getMentorReviewSummary(ies) are DB-touching
// (createAdminSupabase) and this repo's convention is pure-function tests
// only, no DB mocking — same reason there's no test file for hydrateStats
// after 0034 made the equivalent move for feedback session stats.
describe("mentor-reviews module", () => {
  it("exports the DB-backed summary functions", () => {
    expect(typeof getMentorReviewSummary).toBe("function");
    expect(typeof getMentorReviewSummaries).toBe("function");
  });
});
