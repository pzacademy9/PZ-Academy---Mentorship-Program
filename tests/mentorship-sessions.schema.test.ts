import { describe, it, expect } from "vitest";
import { bookSessionsSchema, scheduleSessionSchema } from "@/lib/validations/mentorship-sessions";

describe("bookSessionsSchema", () => {
  it("accepts a booking id with one or more ISO slots", () => {
    const r = bookSessionsSchema.safeParse({
      bookingId: "11111111-1111-4111-8111-111111111111",
      slots: ["2026-09-01T04:00:00.000Z", "2026-09-08T04:00:00.000Z"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects zero slots", () => {
    const r = bookSessionsSchema.safeParse({
      bookingId: "11111111-1111-4111-8111-111111111111",
      slots: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid bookingId", () => {
    const r = bookSessionsSchema.safeParse({ bookingId: "not-a-uuid", slots: ["2026-09-01T04:00:00.000Z"] });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed slot string", () => {
    const r = bookSessionsSchema.safeParse({
      bookingId: "11111111-1111-4111-8111-111111111111",
      slots: ["not-a-date"],
    });
    expect(r.success).toBe(false);
  });
});

describe("scheduleSessionSchema", () => {
  it("accepts a booking id and an ISO date-time", () => {
    const r = scheduleSessionSchema.safeParse({
      bookingId: "11111111-1111-4111-8111-111111111111",
      scheduledAt: "2026-09-01T04:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a missing scheduledAt", () => {
    const r = scheduleSessionSchema.safeParse({ bookingId: "11111111-1111-4111-8111-111111111111" });
    expect(r.success).toBe(false);
  });
});
