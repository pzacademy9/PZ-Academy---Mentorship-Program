import { describe, expect, it } from "vitest";
import { startsInText } from "@/lib/marketing/batch-facts";

// Pakistan is UTC+5. 2026-12-12 19:00 PKT = 14:00 UTC.
const START = "2026-12-12T14:00:00.000Z";

describe("startsInText", () => {
  it("counts whole Pakistan calendar days", () => {
    expect(startsInText(START, new Date("2026-12-07T08:00:00.000Z"))).toBe("Starts in 5 days");
    expect(startsInText(START, new Date("2026-12-11T20:00:00.000Z"))).toBe("Starts today"); // 01:00 PKT on the 12th
  });
  it("says tomorrow and today", () => {
    expect(startsInText(START, new Date("2026-12-11T08:00:00.000Z"))).toBe("Starts tomorrow");
    expect(startsInText(START, new Date("2026-12-12T03:00:00.000Z"))).toBe("Starts today");
  });
  it("is empty when there is no start, a bad start, or it has passed", () => {
    expect(startsInText("", new Date())).toBe("");
    expect(startsInText("nonsense", new Date())).toBe("");
    expect(startsInText(START, new Date("2026-12-13T08:00:00.000Z"))).toBe("");
  });
});
