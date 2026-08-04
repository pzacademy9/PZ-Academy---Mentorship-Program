import { describe, it, expect } from "vitest";
import {
  reviewActionSchema,
  composeRejectionReason,
  ACTION_TARGET_STATUS,
  REJECTION_REASONS,
} from "@/lib/validations/admin-enrollment";

describe("reviewActionSchema", () => {
  it("accepts a bare approve", () => {
    expect(reviewActionSchema.safeParse({ action: "approve" }).success).toBe(true);
  });

  it("accepts reserve with and without a note", () => {
    expect(reviewActionSchema.safeParse({ action: "reserve" }).success).toBe(true);
    expect(
      reviewActionSchema.safeParse({ action: "reserve", note: "Half paid, rest by Friday" })
        .success,
    ).toBe(true);
  });

  it("accepts reject with a preset reason", () => {
    expect(
      reviewActionSchema.safeParse({ action: "reject", reason: "Amount incorrect" }).success,
    ).toBe(true);
  });

  it("rejects a reject without a reason", () => {
    expect(reviewActionSchema.safeParse({ action: "reject" }).success).toBe(false);
  });

  it("rejects a reason outside the preset list", () => {
    expect(
      reviewActionSchema.safeParse({ action: "reject", reason: "Because I said so" }).success,
    ).toBe(false);
  });

  it("rejects an unknown action", () => {
    expect(reviewActionSchema.safeParse({ action: "delete" }).success).toBe(false);
  });

  it("rejects a note over 500 characters", () => {
    expect(
      reviewActionSchema.safeParse({ action: "reserve", note: "x".repeat(501) }).success,
    ).toBe(false);
  });

  it("rejects a non-object body", () => {
    expect(reviewActionSchema.safeParse(null).success).toBe(false);
  });
});

describe("ACTION_TARGET_STATUS", () => {
  it("maps every action to its enrollment status", () => {
    expect(ACTION_TARGET_STATUS).toEqual({
      approve: "active",
      reserve: "reserved",
      reject: "rejected",
      expire: "expired",
    });
  });
});

describe("composeRejectionReason", () => {
  it("returns the preset alone when there is no note", () => {
    expect(composeRejectionReason("Payment not received")).toBe("Payment not received");
  });

  it("appends a note when present", () => {
    expect(composeRejectionReason("Other", "Wrong bank account")).toBe(
      "Other — Wrong bank account",
    );
  });

  it("ignores a whitespace-only note", () => {
    expect(composeRejectionReason("Duplicate submission", "   ")).toBe("Duplicate submission");
  });

  it("covers every preset reason", () => {
    for (const reason of REJECTION_REASONS) {
      expect(composeRejectionReason(reason)).toBe(reason);
    }
  });
});
