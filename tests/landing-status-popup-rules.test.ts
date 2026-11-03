import { describe, it, expect } from "vitest";
import { checkStatusChange } from "@/lib/landing/registration/status-rules";
import { statusChangeBodySchema } from "@/lib/validations/landing-registration-status";

const base = { rowType: "individual" as const, from: "pending" as const, to: "paid" as const, expectedAmount: 39 as number | null, amount: null as number | null };

describe("amount received is in PKR", () => {
  it("Paid needs an amount when the popup asks for one", () => {
    expect(checkStatusChange({ ...base, requireAmount: true })).toEqual({ ok: false, reason: "amount-required" });
    expect(checkStatusChange({ ...base, requireAmount: true, amount: 2936 })).toEqual({ ok: true, amountReceived: 2936 });
  });
  it("Paid without requireAmount still falls back to the expected amount (sheet sync)", () => {
    expect(checkStatusChange(base)).toEqual({ ok: true, amountReceived: 39 });
  });
  it("Underpaid is compared with the full price only for a PKR price", () => {
    expect(checkStatusChange({ ...base, to: "underpaid", currency: "AED", amount: 2000 })).toEqual({ ok: true, amountReceived: 2000 });
    expect(checkStatusChange({ ...base, to: "underpaid", currency: "PKR", expectedAmount: 2736, amount: 2736 })).toEqual({ ok: false, reason: "amount-invalid" });
    expect(checkStatusChange({ ...base, to: "underpaid", currency: "PKR", expectedAmount: 2736, amount: 2000 })).toEqual({ ok: true, amountReceived: 2000 });
  });
});

describe("status change body", () => {
  it("accepts sendEmail as a true or false value", () => {
    expect(statusChangeBodySchema.safeParse({ status: "paid", from: "pending", amount: 2936, sendEmail: false }).success).toBe(true);
    expect(statusChangeBodySchema.safeParse({ status: "paid", from: "pending", sendEmail: "no" }).success).toBe(false);
  });
});
