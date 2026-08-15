import { describe, it, expect } from "vitest";
import { average, withinRateLimit, isDuplicateSubmission } from "@/lib/validations/feedback";

describe("average", () => {
  it("returns null for an empty array", () => expect(average([])).toBeNull());
  it("rounds to one decimal", () => expect(average([4, 5, 5])).toBe(4.7));
  it("handles a single value", () => expect(average([3])).toBe(3));
});

describe("withinRateLimit", () => {
  it("allows under the max", () => expect(withinRateLimit(2, 3)).toBe(true));
  it("blocks at the max", () => expect(withinRateLimit(3, 3)).toBe(false));
});

describe("isDuplicateSubmission", () => {
  it("is false when there is no prior submission", () => {
    expect(isDuplicateSubmission(null, 300_000, Date.now())).toBe(false);
  });
  it("is true inside the window", () => {
    const now = Date.now();
    expect(isDuplicateSubmission(new Date(now - 60_000).toISOString(), 300_000, now)).toBe(true);
  });
  it("is false outside the window", () => {
    const now = Date.now();
    expect(isDuplicateSubmission(new Date(now - 600_000).toISOString(), 300_000, now)).toBe(false);
  });
});
