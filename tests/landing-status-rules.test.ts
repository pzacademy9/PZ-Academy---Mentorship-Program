import { describe, it, expect } from "vitest";
import { checkStatusChange, STATUS_CHANGE_MESSAGES } from "@/lib/landing/registration/status-rules";
import { formatMoney } from "@/lib/format-money";
import { statusChangeBodySchema } from "@/lib/validations/landing-registration-status";

const base = { rowType: "individual" as const, from: "pending" as const, to: "paid" as const, expectedAmount: 5000 as number | null, amount: null as number | null };

describe("checkStatusChange", () => {
  it("member rows are rejected", () => {
    expect(checkStatusChange({ ...base, rowType: "member" })).toEqual({ ok: false, reason: "member-row" });
  });
  it("free rows are rejected", () => {
    expect(checkStatusChange({ ...base, from: "free" })).toEqual({ ok: false, reason: "free-row" });
  });
  it("same status is already-in-status", () => {
    expect(checkStatusChange({ ...base, from: "paid", to: "paid" })).toEqual({ ok: false, reason: "already-in-status" });
    expect(checkStatusChange({ ...base, from: "reserved", to: "reserved" })).toEqual({ ok: false, reason: "already-in-status" });
    expect(checkStatusChange({ ...base, from: "underpaid", to: "underpaid" })).toEqual({ ok: false, reason: "already-in-status" });
  });
  it("underpaid same status with a new amount is allowed", () => {
    expect(checkStatusChange({ ...base, from: "underpaid", to: "underpaid", amount: 3000 })).toEqual({ ok: true, amountReceived: 3000 });
  });
  it("underpaid without amount is amount-required", () => {
    expect(checkStatusChange({ ...base, to: "underpaid" })).toEqual({ ok: false, reason: "amount-required" });
  });
  it("underpaid 0, -5, NaN is amount-invalid", () => {
    for (const amount of [0, -5, NaN]) {
      expect(checkStatusChange({ ...base, to: "underpaid", amount })).toEqual({ ok: false, reason: "amount-invalid" });
    }
  });
  it("underpaid amount >= expected is amount-invalid", () => {
    expect(checkStatusChange({ ...base, to: "underpaid", amount: 5000 })).toEqual({ ok: false, reason: "amount-invalid" });
    expect(checkStatusChange({ ...base, to: "underpaid", amount: 6000 })).toEqual({ ok: false, reason: "amount-invalid" });
    expect(checkStatusChange({ ...base, to: "underpaid", amount: 4999 })).toEqual({ ok: true, amountReceived: 4999 });
  });
  it("paid takes entered amount else expected", () => {
    expect(checkStatusChange({ ...base, to: "paid", amount: 4800 })).toEqual({ ok: true, amountReceived: 4800 });
    expect(checkStatusChange({ ...base, to: "paid" })).toEqual({ ok: true, amountReceived: 5000 });
    expect(checkStatusChange({ ...base, to: "paid", expectedAmount: null })).toEqual({ ok: true, amountReceived: null });
  });
  it("pending and reserved return amountReceived null", () => {
    expect(checkStatusChange({ ...base, from: "paid", to: "pending", amount: 100 })).toEqual({ ok: true, amountReceived: null });
    expect(checkStatusChange({ ...base, to: "reserved" })).toEqual({ ok: true, amountReceived: null });
  });
  it("has a plain sentence for every reason", () => {
    for (const m of Object.values(STATUS_CHANGE_MESSAGES)) expect(m.length).toBeGreaterThan(10);
    expect(Object.keys(STATUS_CHANGE_MESSAGES).sort()).toEqual(["already-in-status", "amount-invalid", "amount-required", "free-row", "member-row"]);
  });
});

describe("formatMoney", () => {
  it("formatMoney shows currency and handles null as a dash", () => {
    expect(formatMoney(null, "PKR")).toBe("—");
    expect(formatMoney(5000, "PKR")).toBe("PKR 5,000");
    expect(formatMoney(12.5, "USD")).toBe("USD 12.5");
  });
});

describe("statusChangeBodySchema", () => {
  it("schema rejects unknown keys and unknown statuses", () => {
    expect(statusChangeBodySchema.safeParse({ status: "paid", from: "pending", extra: 1 }).success).toBe(false);
    expect(statusChangeBodySchema.safeParse({ status: "free", from: "pending" }).success).toBe(false);
    expect(statusChangeBodySchema.safeParse({ status: "paid", from: "bogus" }).success).toBe(false);
    expect(statusChangeBodySchema.safeParse({ status: "paid", from: "free", amount: null }).success).toBe(true);
    expect(statusChangeBodySchema.safeParse({ status: "underpaid", from: "paid", amount: 10 }).success).toBe(true);
  });
  it("schema requires from", () => {
    expect(statusChangeBodySchema.safeParse({ status: "paid" }).success).toBe(false);
  });
});
