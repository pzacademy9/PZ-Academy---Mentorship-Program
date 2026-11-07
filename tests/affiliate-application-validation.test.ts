import { describe, expect, it } from "vitest";
import { affiliateApplicationSchema } from "@/lib/validations/affiliate-application";

const valid = () => ({
  name: "Test Person",
  email: "test.person@example.com",
  whatsapp: "+92 300 1234567",
  city: "Lahore",
  country: "Pakistan",
  status: "student" as const,
  organization: "Test University",
  field: "PharmD",
  commissionExperience: { yes: true, details: "Sold event passes" },
  eventsManaged: { yes: false, details: "" },
  promotingPrograms: true,
  onlineSales: false,
  ratings: { marketing: 4, eventPromotion: 3, onlineEngagement: 5, communication: 2 },
  hoursPerWeek: "4-6" as const,
  linkedin: "",
  why: "I help my class find good courses.",
  agreeTerms: true,
  website: "",
});

const fails = (patch: Record<string, unknown>) => !affiliateApplicationSchema.safeParse({ ...valid(), ...patch }).success;

describe("affiliateApplicationSchema", () => {
  it("accepts a full valid application", () => {
    expect(affiliateApplicationSchema.safeParse(valid()).success).toBe(true);
  });
  it("lowercases and trims the email", () => {
    const r = affiliateApplicationSchema.parse({ ...valid(), email: "  Test.Person@Example.COM " });
    expect(r.email).toBe("test.person@example.com");
  });
  it("needs every required field", () => {
    for (const key of ["name", "email", "whatsapp", "city", "country", "status", "organization", "field", "hoursPerWeek", "why", "ratings", "commissionExperience", "eventsManaged"]) {
      const o: Record<string, unknown> = valid();
      delete o[key];
      expect(affiliateApplicationSchema.safeParse(o).success, key).toBe(false);
    }
  });
  it("refuses a bad email, a short phone, and a status or hours outside the lists", () => {
    expect(fails({ email: "not-an-email" })).toBe(true);
    expect(fails({ whatsapp: "12345" })).toBe(true);
    expect(fails({ whatsapp: "abc" })).toBe(true);
    expect(fails({ status: "teacher" })).toBe(true);
    expect(fails({ hoursPerWeek: "40" })).toBe(true);
  });
  it("keeps ratings between 1 and 5", () => {
    for (const bad of [0, 6, 2.5]) {
      expect(fails({ ratings: { ...valid().ratings, marketing: bad } }), String(bad)).toBe(true);
    }
  });
  it("needs details when an experience answer is yes", () => {
    expect(fails({ commissionExperience: { yes: true, details: "" } })).toBe(true);
    expect(fails({ eventsManaged: { yes: true, details: "ab" } })).toBe(true);
    expect(fails({ commissionExperience: { yes: false, details: "" } })).toBe(false);
  });
  it("refuses a filled honeypot", () => {
    expect(fails({ website: "http://spam.example" })).toBe(true);
  });
  it("only accepts a LinkedIn link that starts with https://", () => {
    expect(fails({ linkedin: "linkedin.com/in/x" })).toBe(true);
    expect(fails({ linkedin: "http://linkedin.com/in/x" })).toBe(true);
    expect(fails({ linkedin: "https://linkedin.com/in/x" })).toBe(false);
    expect(fails({ linkedin: "" })).toBe(false);
  });
  it("requires the terms tick to be literally true", () => {
    expect(fails({ agreeTerms: false })).toBe(true);
    expect(fails({ agreeTerms: "true" })).toBe(true);
    const o: Record<string, unknown> = valid();
    delete o.agreeTerms;
    expect(affiliateApplicationSchema.safeParse(o).success).toBe(false);
  });
  it("caps long text", () => {
    expect(fails({ name: "a".repeat(81) })).toBe(true);
    expect(fails({ why: "a".repeat(1001) })).toBe(true);
    expect(fails({ why: "short" })).toBe(true);
    expect(fails({ organization: "a".repeat(121) })).toBe(true);
    expect(fails({ linkedin: "https://" + "a".repeat(200) })).toBe(true);
    expect(fails({ commissionExperience: { yes: true, details: "a".repeat(601) } })).toBe(true);
  });
  it("keeps markup as plain text (it is never rendered as HTML)", () => {
    const r = affiliateApplicationSchema.parse({ ...valid(), why: "<script>alert(1)</script> I like teaching" });
    expect(r.why).toContain("<script>");
  });
});
