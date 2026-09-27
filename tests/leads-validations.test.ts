import { describe, it, expect } from "vitest";
import { leadCreateSchema, leadSheetSyncSchema } from "@/lib/validations/leads";

describe("leadCreateSchema", () => {
  const base = { token: "abc", phone: "03234267102" };

  it("accepts a minimal valid submission and normalizes the phone", () => {
    const result = leadCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+923234267102");
  });

  it("rejects a missing phone", () => {
    const result = leadCreateSchema.safeParse({ token: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects an ambiguous phone (two numbers in one field)", () => {
    const result = leadCreateSchema.safeParse({ ...base, phone: "0323/0324" });
    expect(result.success).toBe(false);
  });

  it("rejects resolution: 'update' without existingLeadId", () => {
    const result = leadCreateSchema.safeParse({ ...base, resolution: "update" });
    expect(result.success).toBe(false);
  });

  it("accepts resolution: 'update' with existingLeadId", () => {
    const result = leadCreateSchema.safeParse({
      ...base,
      resolution: "update",
      existingLeadId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("treats an empty-string email as absent", () => {
    const result = leadCreateSchema.safeParse({ ...base, email: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });
});

describe("leadSheetSyncSchema", () => {
  it("accepts a valid GAS payload", () => {
    const result = leadSheetSyncSchema.safeParse({
      token: "secret",
      id: "11111111-1111-4111-8111-111111111111",
      status: "contacted",
      notes: "called, no answer",
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    const result = leadSheetSyncSchema.safeParse({
      token: "secret",
      id: "not-a-uuid",
      status: "contacted",
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
