import { describe, it, expect } from "vitest";
import { summarizeFeedback, summarizeAttendance } from "@/lib/classes/summary";
import type { GridRow } from "@/lib/data/attendance";

const row = (pct: number | null, id = "p"): GridRow => ({
  personId: id, pzId: id, name: id, marks: {}, started: pct === null ? 0 : 4, marked: 0, pct, meetsMin: false,
});

describe("summarizeFeedback", () => {
  it("no responses gives null average, not NaN", () => {
    const s = summarizeFeedback([{ number: 1, responses: 0, avg: null }, { number: 2, responses: 0, avg: null }]);
    expect(s.totalResponses).toBe(0);
    expect(s.overallAvg).toBeNull();
    expect(summarizeFeedback([]).overallAvg).toBeNull();
  });
  it("average is weighted by responses", () => {
    const s = summarizeFeedback([
      { number: 1, responses: 10, avg: 5 },
      { number: 2, responses: 30, avg: 3 },
      { number: 3, responses: 0, avg: null },
    ]);
    expect(s.totalResponses).toBe(40);
    expect(s.overallAvg).toBeCloseTo(3.5, 5);
    expect(s.perClass).toHaveLength(3);
  });
});

describe("summarizeAttendance", () => {
  it("no started class gives null attendance average", () => {
    const s = summarizeAttendance([row(null, "a"), row(null, "b")], 75);
    expect(s).toEqual({ averagePct: null, meetingMin: 0, total: 2 });
    expect(summarizeAttendance([], 75).averagePct).toBeNull();
  });
  it("meetingMin counts students at or above minPct", () => {
    const s = summarizeAttendance([row(100, "a"), row(75, "b"), row(50, "c"), row(null, "d")], 75);
    expect(s.meetingMin).toBe(2);
    expect(s.total).toBe(4);
    expect(s.averagePct).toBe(75);
  });
});
