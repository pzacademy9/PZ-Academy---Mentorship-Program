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
