import { describe, it, expect } from "vitest";
import { mentorSelfEditSchema } from "@/lib/validations/mentor-self";

const valid = {
  shortBio: "Updated bio.",
  fullBio: ["Paragraph one."],
  photoUrl: "/mentor-dr-roha.png",
  availabilityText: "Mon, Wed",
  introVideoUrl: "https://youtube.com/watch?v=abc",
  linkedinUrl: "https://linkedin.com/in/example",
  socialLinks: [{ label: "Twitter", url: "https://twitter.com/example" }],
  skills: ["Clinical Knowledge"],
  credentials: [{ title: "MBBS", institution: "Pakistan", icon: "GraduationCap" }],
  timezone: "Asia/Karachi",
  sessionDurationText: "60 min",
};

describe("mentorSelfEditSchema", () => {
  it("accepts a full payload", () => {
    expect(mentorSelfEditSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an empty payload — every field is optional", () => {
    expect(mentorSelfEditSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an invalid introVideoUrl", () => {
    const result = mentorSelfEditSchema.safeParse({ ...valid, introVideoUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("has no pricing, visibility, or identity fields", () => {
    const shape = mentorSelfEditSchema.shape;
    expect(shape).not.toHaveProperty("pricePerSessionPkr");
    expect(shape).not.toHaveProperty("visibility");
    expect(shape).not.toHaveProperty("name");
    expect(shape).not.toHaveProperty("slug");
    expect(shape).not.toHaveProperty("packages");
  });
});
