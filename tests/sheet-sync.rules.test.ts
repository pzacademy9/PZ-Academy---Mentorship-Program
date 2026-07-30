import { describe, it, expect } from "vitest";
import { RANK, isDowngrade, mapSheetRow, PAYMENT_CONFIRMATION_VALUES } from "@/lib/validations/sheet-sync";

describe("RANK", () => {
  it("orders every enrollment_status by access level", () => {
    expect(RANK).toEqual({
      rejected: 0,
      expired: 0,
      pending: 1,
      reserved: 2,
      active: 3,
    });
  });
});

describe("isDowngrade", () => {
  it("is true when the target rank is lower than the current rank", () => {
    expect(isDowngrade("active", "pending")).toBe(true);
    expect(isDowngrade("reserved", "rejected")).toBe(true);
  });

  it("is false when the target rank is equal or higher", () => {
    expect(isDowngrade("pending", "active")).toBe(false);
    expect(isDowngrade("pending", "pending")).toBe(false);
    expect(isDowngrade("rejected", "pending")).toBe(false);
  });

  it("treats expired and rejected as the same rank", () => {
    expect(isDowngrade("rejected", "expired")).toBe(false);
    expect(isDowngrade("expired", "rejected")).toBe(false);
  });
});

describe("mapSheetRow", () => {
  it("maps Paid to active, carrying the amount", () => {
    expect(mapSheetRow({ paymentConfirmation: "Paid", amountPkr: 15000 })).toEqual({
      status: "active",
      paymentAmountPkr: 15000,
      shortfallPkr: null,
    });
  });

  it("maps Pending to pending", () => {
    expect(mapSheetRow({ paymentConfirmation: "Pending", amountPkr: null })).toEqual({
      status: "pending",
      paymentAmountPkr: null,
      shortfallPkr: null,
    });
  });

  it("maps Reserved to reserved", () => {
    expect(mapSheetRow({ paymentConfirmation: "Reserved", amountPkr: 5000 })).toEqual({
      status: "reserved",
      paymentAmountPkr: 5000,
      shortfallPkr: null,
    });
  });

  it("maps Underpaid to pending with the amount moved to shortfallPkr", () => {
    expect(mapSheetRow({ paymentConfirmation: "Underpaid", amountPkr: 2000 })).toEqual({
      status: "pending",
      paymentAmountPkr: null,
      shortfallPkr: 2000,
    });
  });
});

describe("PAYMENT_CONFIRMATION_VALUES", () => {
  it("is exactly the four known sheet dropdown values", () => {
    expect(PAYMENT_CONFIRMATION_VALUES).toEqual(["Paid", "Pending", "Underpaid", "Reserved"]);
  });
});
