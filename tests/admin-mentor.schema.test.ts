import { describe, it, expect } from "vitest";
import {
  mentorConfigSchema,
  mentorCreateSchema,
  MENTOR_VISIBILITIES,
} from "@/lib/validations/admin-mentor";
import { Constants } from "@/lib/supabase/database.types";

const valid = {
  name: "Dr. Roha",
  title: "Clinical Medicine & Healthcare Management",
  expertise: "Clinical Medicine",
  shortBio: "MBBS doctor and Medical Officer with 5 years of experience.",
  fullBio: ["Paragraph one.", "Paragraph two."],
  photoUrl: "/mentor-dr-roha.png",
  experience: "5 Years",
  domain: "Medicine & Healthcare",
  language: "English / Urdu",
  format: "Online via Google Meet",
  pricePerSessionPkr: 3500,
  packages: [
    { name: "Single Session", sessions: 1, price: 3500 },
    { name: "3-Session Pack", sessions: 3, price: 9500, savings: 1000 },
  ],
  availabilityText: "Mon, Tue, Fri (Full Day)",
  leadTime: "24 hours advance",
  credentials: [{ title: "MBBS", institution: "Pakistan", icon: "GraduationCap" }],
  skills: ["Clinical Knowledge & Patient Care"],
  introVideoUrl: "https://youtube.com/watch?v=abc",
  linkedinUrl: "https://linkedin.com/in/example",
  socialLinks: [{ label: "Twitter", url: "https://twitter.com/example" }],
  testimonials: [{ quote: "Great mentor!", author: "A Student", role: "Pharm-D Student" }],
  sessionDurationMinutes: 60,
  sessionDurationText: undefined,
  timezone: "Asia/Karachi",
  visibility: "published",
};

describe("mentorConfigSchema", () => {
  it("accepts a full payload shaped like the seeded dr-roha record", () => {
    expect(mentorConfigSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts the minimal required fields with everything else omitted", () => {
    const result = mentorConfigSchema.safeParse({
      name: "New Mentor",
      pricePerSessionPkr: 0,
      sessionDurationMinutes: 60,
      visibility: "draft",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative price", () => {
    const result = mentorConfigSchema.safeParse({ ...valid, pricePerSessionPkr: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects sessionDurationMinutes <= 0", () => {
    expect(mentorConfigSchema.safeParse({ ...valid, sessionDurationMinutes: 0 }).success).toBe(false);
    expect(mentorConfigSchema.safeParse({ ...valid, sessionDurationMinutes: -30 }).success).toBe(false);
  });

  it("rejects a package with sessions < 1", () => {
    const result = mentorConfigSchema.safeParse({
      ...valid,
      packages: [{ name: "Broken", sessions: 0, price: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a package with a negative price", () => {
    const result = mentorConfigSchema.safeParse({
      ...valid,
      packages: [{ name: "Broken", sessions: 1, price: -100 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate package names", () => {
    const result = mentorConfigSchema.safeParse({
      ...valid,
      packages: [
        { name: "Single Session", sessions: 1, price: 3500 },
        { name: "Single Session", sessions: 3, price: 9000 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a credential icon outside CREDENTIAL_ICONS", () => {
    const result = mentorConfigSchema.safeParse({
      ...valid,
      credentials: [{ title: "X", institution: "Y", icon: "Rocket" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a testimonial missing quote", () => {
    const result = mentorConfigSchema.safeParse({
      ...valid,
      testimonials: [{ author: "Someone", role: "Student" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a visibility value outside MENTOR_VISIBILITIES", () => {
    const result = mentorConfigSchema.safeParse({ ...valid, visibility: "archived" });
    expect(result.success).toBe(false);
  });

  it("coerces an empty string to undefined for url fields", () => {
    const result = mentorConfigSchema.safeParse({ ...valid, photoUrl: "", introVideoUrl: "", linkedinUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photoUrl).toBeUndefined();
      expect(result.data.introVideoUrl).toBeUndefined();
      expect(result.data.linkedinUrl).toBeUndefined();
    }
  });

  it("rejects a scheme-less URL", () => {
    const result = mentorConfigSchema.safeParse({ ...valid, linkedinUrl: "linkedin.com/in/example" });
    expect(result.success).toBe(false);
  });

  it("ignores a slug field if one is passed — slug is immutable and not part of this schema", () => {
    const result = mentorConfigSchema.safeParse({ ...valid, slug: "attacker-supplied-slug" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).slug).toBeUndefined();
    }
  });
});

describe("mentorCreateSchema", () => {
  it("accepts a non-empty name", () => {
    expect(mentorCreateSchema.safeParse({ name: "New Mentor" }).success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = mentorCreateSchema.safeParse({ name: "  New Mentor  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("New Mentor");
  });

  it("rejects an empty name", () => {
    expect(mentorCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(mentorCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over the max length", () => {
    expect(mentorCreateSchema.safeParse({ name: "x".repeat(201) }).success).toBe(false);
  });
});

/**
 * Catches the single most likely mistake when adding a Postgres enum to this
 * codebase's hand-maintained database.types.ts: editing the `Enums` type
 * block (compile-time only) but forgetting the runtime `Constants` block
 * that MENTOR_TIMEZONES-style app code actually reads from. See the "3
 * places" note on mentor_visibility in database.types.ts.
 */
describe("MENTOR_VISIBILITIES", () => {
  it("matches Constants.public.Enums.mentor_visibility exactly", () => {
    expect([...MENTOR_VISIBILITIES].sort()).toEqual([...Constants.public.Enums.mentor_visibility].sort());
  });
});
