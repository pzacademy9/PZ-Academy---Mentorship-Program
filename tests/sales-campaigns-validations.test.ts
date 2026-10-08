import { describe, it, expect } from "vitest";
import { campaignCreateSchema, campaignRecipientSchema, campaignStatusSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

const id = "11111111-1111-4111-8111-111111111111";
describe("campaign validations", () => {
  it("accepts a valid create body and defaults follow-up to 24 hours", () => {
    const r = campaignCreateSchema.parse({ messageTemplate: "Hi {{first_name}}", contactIds: [id], numberId: id });
    expect(r.followupInHours).toBe(24);
  });
  it("rejects bad follow-up hours, empty or oversize selections and blank messages", () => {
    const base = { messageTemplate: "Hi", contactIds: [id], numberId: id };
    expect(campaignCreateSchema.safeParse({ ...base, followupInHours: 5 }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...base, contactIds: [] }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...base, contactIds: Array(2001).fill(id) }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...base, messageTemplate: "  " }).success).toBe(false);
  });
  it("recipient and status bodies", () => {
    expect(campaignRecipientSchema.safeParse({ recipientId: id }).success).toBe(true);
    expect(campaignRecipientSchema.safeParse({ recipientId: "x" }).success).toBe(false);
    expect(campaignStatusSchema.safeParse({ status: "paused" }).success).toBe(true);
    expect(campaignStatusSchema.safeParse({ status: "done" }).success).toBe(false);
  });
  it("maps new reasons to HTTP statuses", () => {
    expect(statusForReason("already-handled")).toBe(409);
    expect(statusForReason("campaign-done")).toBe(409);
    expect(statusForReason("variety")).toBe(400);
    expect(statusForReason("empty-audience")).toBe(400);
    expect(statusForReason("too-many")).toBe(400);
    expect(statusForReason("not-found")).toBe(404);
  });
});
