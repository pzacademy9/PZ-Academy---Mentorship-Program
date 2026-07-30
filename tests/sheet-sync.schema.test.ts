import { describe, it, expect } from "vitest";
import { sheetSyncWebhookSchema } from "@/lib/validations/sheet-sync";

const validRow = {
  email: "student@example.com",
  name: "Test Student",
  paymentConfirmation: "Paid" as const,
  amountPkr: 15000,
};

describe("sheetSyncWebhookSchema", () => {
  it("accepts a valid newSubmission payload", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "newSubmission", sheetId: "abc123", row: validRow })
        .success,
    ).toBe(true);
  });

  it("accepts a valid statusChange payload", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "statusChange", sheetId: "abc123", row: validRow })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown action", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "delete", sheetId: "abc123", row: validRow })
        .success,
    ).toBe(false);
  });

  it("rejects a missing sheetId", () => {
    expect(sheetSyncWebhookSchema.safeParse({ action: "newSubmission", row: validRow }).success).toBe(
      false,
    );
  });

  it("rejects an invalid email", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({
        action: "newSubmission",
        sheetId: "abc123",
        row: { ...validRow, email: "not-an-email" },
      }).success,
    ).toBe(false);
  });

  it("rejects a paymentConfirmation outside the known four values", () => {
    expect(
      sheetSyncWebhookSchema.safeParse({
        action: "newSubmission",
        sheetId: "abc123",
        row: { ...validRow, paymentConfirmation: "Refunded" },
      }).success,
    ).toBe(false);
  });

  it("accepts a row with no amountPkr", () => {
    const { amountPkr, ...rest } = validRow;
    expect(
      sheetSyncWebhookSchema.safeParse({ action: "newSubmission", sheetId: "abc123", row: rest })
        .success,
    ).toBe(true);
  });

  it("rejects a non-object body", () => {
    expect(sheetSyncWebhookSchema.safeParse(null).success).toBe(false);
  });
});
