import { describe, it, expect } from "vitest";
import { mentorshipApplicationSchema } from "@/lib/validations/mentorship-application";

const valid = {
  fullName: "Dr. Jane Smith",
  email: "jane@example.com",
  phone: "+92 300 0000000",
  cvBase64: "abc123",
  cvFileName: "cv.pdf",
  photos: [{ name: "photo.jpg", base64: "xyz789" }],
};

describe("mentorshipApplicationSchema", () => {
  it("accepts a valid application", () => {
    expect(mentorshipApplicationSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional fields when present", () => {
    const result = mentorshipApplicationSchema.safeParse({
      ...valid,
      country: "Pakistan",
      profession: "Pharmacist",
      roles: "mentor, instructor",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing cvBase64", () => {
    const { cvBase64, ...rest } = valid;
    expect(mentorshipApplicationSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty photos array", () => {
    const result = mentorshipApplicationSchema.safeParse({ ...valid, photos: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = mentorshipApplicationSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});
