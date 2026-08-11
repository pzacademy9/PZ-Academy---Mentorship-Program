import { describe, it, expect } from "vitest";
import { mentorInviteEmailSchema } from "@/lib/validations/mentor-account";

describe("mentorInviteEmailSchema", () => {
  it("accepts a valid email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "mentor@example.com" });
    expect(result.success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "  Mentor@Example.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("mentor@example.com");
  });

  it("rejects an invalid email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty email", () => {
    const result = mentorInviteEmailSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });
});
