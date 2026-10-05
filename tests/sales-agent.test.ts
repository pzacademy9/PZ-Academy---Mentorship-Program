import { describe, it, expect } from "vitest";
import { salesAgentInviteSchema } from "@/lib/validations/sales-agent";
import { decidePromotion } from "@/lib/crm/sales-agent-rules";

describe("salesAgentInviteSchema", () => {
  it("accepts a valid invite and normalises the email", () => {
    const parsed = salesAgentInviteSchema.parse({ email: "  Agent@Example.COM ", fullName: "  Sara Khan " });
    expect(parsed).toEqual({ email: "agent@example.com", fullName: "Sara Khan" });
  });
  it("rejects a bad email, an empty name, and an over-long name", () => {
    expect(salesAgentInviteSchema.safeParse({ email: "nope", fullName: "Sara" }).success).toBe(false);
    expect(salesAgentInviteSchema.safeParse({ email: "a@b.co", fullName: "   " }).success).toBe(false);
    expect(salesAgentInviteSchema.safeParse({ email: "a@b.co", fullName: "x".repeat(121) }).success).toBe(false);
  });
});

describe("decidePromotion", () => {
  it("promotes a plain student", () => {
    expect(decidePromotion("student")).toBe("promote");
  });
  it("treats a missing profile like a student", () => {
    expect(decidePromotion(null)).toBe("promote");
    expect(decidePromotion(undefined)).toBe("promote");
  });
  it("is a no-op for an existing sales agent", () => {
    expect(decidePromotion("sales_agent")).toBe("already-sales-agent");
  });
  it("never demotes an admin or super_admin", () => {
    expect(decidePromotion("admin")).toBe("refuse-admin");
    expect(decidePromotion("super_admin")).toBe("refuse-admin");
  });
  it("never converts a mentor, who would lose mentor access", () => {
    expect(decidePromotion("mentor")).toBe("refuse-mentor");
  });
});

import { decideRemoval } from "@/lib/crm/sales-agent-rules";

describe("decideRemoval", () => {
  it("fully removes a sales agent regardless of contact count", () => {
    expect(decideRemoval("sales_agent", 0)).toBe("demote-and-release");
    expect(decideRemoval("sales_agent", 5)).toBe("demote-and-release");
  });
  it("re-runs only the release for a student left owning contacts by an interrupted removal", () => {
    expect(decideRemoval("student", 3)).toBe("release-only");
  });
  it("does nothing for a student with no contacts", () => {
    expect(decideRemoval("student", 0)).toBe("not-found");
  });
  it("never touches admins, super_admins or mentors, even if they own contacts", () => {
    for (const r of ["admin", "super_admin", "mentor"] as const) {
      expect(decideRemoval(r, 4)).toBe("not-found");
    }
  });
});
