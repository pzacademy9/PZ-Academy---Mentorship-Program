import { describe, it, expect } from "vitest";
import {
  WITHDRAW_PKR,
  validatePayoutDetails,
  maskAccount,
  availableBalance,
  canRequest,
} from "@/lib/affiliates/payouts";

describe("payout rules", () => {
  it("threshold", () => {
    expect(WITHDRAW_PKR).toBe(3500);
    expect(canRequest(3499.99)).toBe(false);
    expect(canRequest(3500)).toBe(true);
  });
  it("availableBalance", () => {
    expect(availableBalance(5000, 1500.5)).toBe(3499.5);
    expect(availableBalance(100, 500)).toBe(0);
  });
  it("cleans a wallet number", () => {
    const r = validatePayoutDetails({ method: "jazzcash", title: "Ali Khan", number: "0300-123 4567" });
    expect(r).toEqual({ ok: true, method: "jazzcash", title: "Ali Khan", number: "03001234567" });
  });
  it("refuses letters in a wallet number", () => {
    expect(validatePayoutDetails({ method: "easypaisa", title: "Ali Khan", number: "0300abc4567" }).ok).toBe(false);
  });
  it("refuses a 23-character IBAN", () => {
    expect(validatePayoutDetails({ method: "bank", title: "Ali Khan", number: "PK36SCBL000000112345678" }).ok).toBe(false);
  });
  it("accepts and upper-cases a lower-case IBAN", () => {
    const r = validatePayoutDetails({ method: "bank", title: "Ali Khan", number: "pk36 scbl 0000 0011 2345 6702" });
    expect(r).toEqual({ ok: true, method: "bank", title: "Ali Khan", number: "PK36SCBL0000001123456702" });
  });
  it("refuses unknown method and short title", () => {
    expect(validatePayoutDetails({ method: "paypal", title: "Ali Khan", number: "03001234567" }).ok).toBe(false);
    expect(validatePayoutDetails({ method: "jazzcash", title: "A", number: "03001234567" }).ok).toBe(false);
  });
  it("masks", () => {
    expect(maskAccount("03001234567")).toBe("•••• 4567");
  });
});
