import { describe, it, expect } from "vitest";
import { computeAvailableSlots, resolveSessionsTotal } from "@/lib/data/session-slots";

describe("resolveSessionsTotal", () => {
  const packages = [
    { name: "Single Consultation", sessions: 1, price: 5000 },
    { name: "3-Session Mastery", sessions: 3, price: 12000 },
  ];

  it("returns the matching package's session count", () => {
    expect(resolveSessionsTotal("3-Session Mastery", packages)).toBe(3);
  });

  it("falls back to 1 when the package name has no match", () => {
    expect(resolveSessionsTotal("Renamed Package", packages)).toBe(1);
  });

  it("falls back to 1 for an empty packages array", () => {
    expect(resolveSessionsTotal("Anything", [])).toBe(1);
  });
});

describe("computeAvailableSlots", () => {
  // Wednesday 2026-08-12 is used as "now" throughout — a known, fixed
  // reference point so the tests don't depend on the real clock.
  const now = new Date("2026-08-12T03:00:00.000Z"); // 08:00 Asia/Karachi

  const baseInput = {
    availability: {
      weeklyRanges: [
        { day: 3, start: "09:00", end: "11:00" }, // Wednesday, 2 slots of 60min
      ],
    },
    timezone: "Asia/Karachi", // UTC+5, no DST
    durationMinutes: 60,
    leadTimeHours: 24,
    bookedSlots: [] as string[],
    now,
    daysAhead: 7,
  };

  it("generates slots only within the configured weekly window", () => {
    const slots = computeAvailableSlots(baseInput);
    // 09:00 and 10:00 Asia/Karachi on the next Wednesday (2026-08-19,
    // since 2026-08-12 itself is inside the lead time below)
    expect(slots).toEqual(["2026-08-19T04:00:00.000Z", "2026-08-19T05:00:00.000Z"]);
  });

  it("excludes slots inside the lead time", () => {
    const soon = { ...baseInput, now: new Date("2026-08-19T03:30:00.000Z"), leadTimeHours: 24 };
    // now is 1 hour before the 09:00 Karachi slot on the 19th — inside a
    // 24h lead time, so that whole day's slots are excluded, next
    // Wednesday (26th) is offered instead.
    const slots = computeAvailableSlots(soon);
    expect(slots).toEqual(["2026-08-26T04:00:00.000Z", "2026-08-26T05:00:00.000Z"]);
  });

  it("excludes slots already present in bookedSlots", () => {
    const slots = computeAvailableSlots({
      ...baseInput,
      bookedSlots: ["2026-08-19T04:00:00.000Z"],
    });
    expect(slots).toEqual(["2026-08-19T05:00:00.000Z"]);
  });

  it("returns an empty array when weeklyRanges is empty", () => {
    expect(computeAvailableSlots({ ...baseInput, availability: { weeklyRanges: [] } })).toEqual([]);
  });
});
