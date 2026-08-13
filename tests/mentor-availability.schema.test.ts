import { describe, it, expect } from "vitest";
import { mentorAvailabilitySchema } from "@/lib/validations/mentor-availability";

describe("mentorAvailabilitySchema", () => {
  const valid = {
    timezone: "Asia/Karachi",
    weeklyRanges: [{ day: 1, start: "09:00", end: "17:00" }],
  };

  it("accepts a valid weekly pattern", () => {
    expect(mentorAvailabilitySchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty weeklyRanges array (mentor turned everything off)", () => {
    expect(mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [] }).success).toBe(true);
  });

  it("rejects day outside 0-6", () => {
    const r = mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [{ day: 7, start: "09:00", end: "17:00" }] });
    expect(r.success).toBe(false);
  });

  it("rejects end time not after start time", () => {
    const r = mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [{ day: 1, start: "17:00", end: "09:00" }] });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const r = mentorAvailabilitySchema.safeParse({ ...valid, weeklyRanges: [{ day: 1, start: "9am", end: "17:00" }] });
    expect(r.success).toBe(false);
  });

  it("rejects an empty timezone", () => {
    expect(mentorAvailabilitySchema.safeParse({ ...valid, timezone: "" }).success).toBe(false);
  });
});
