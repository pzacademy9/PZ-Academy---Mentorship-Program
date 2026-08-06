import { describe, it, expect } from "vitest";
import { mentorshipBookingSchema } from "@/lib/validations/mentorship-booking";

const valid = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "+92 300 0000000",
  mentorSlug: "dr-roha",
  mentorName: "Dr. Roha",
  packageName: "Single Session",
};

describe("mentorshipBookingSchema", () => {
  it("accepts a valid booking with no screenshot", () => {
    expect(mentorshipBookingSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid booking with a full screenshot triple", () => {
    const result = mentorshipBookingSchema.safeParse({
      ...valid,
      screenshotBase64: "abc123",
      screenshotName: "receipt.png",
      screenshotMimeType: "image/png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a screenshot with a missing filename", () => {
    const result = mentorshipBookingSchema.safeParse({
      ...valid,
      screenshotBase64: "abc123",
      screenshotMimeType: "image/png",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = mentorshipBookingSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing mentorSlug", () => {
    const { mentorSlug, ...rest } = valid;
    expect(mentorshipBookingSchema.safeParse(rest).success).toBe(false);
  });
});
