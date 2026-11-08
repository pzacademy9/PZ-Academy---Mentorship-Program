import { describe, it, expect } from "vitest";
import {
  commissionPercent,
  commissionAmount,
  paidSoFar,
  balancePkr,
  splitCommissions,
} from "@/lib/affiliates/commission";

describe("commissionPercent", () => {
  it("automatic: 8% below 10 paid participants", () => {
    expect(commissionPercent({ mode: "automatic", manualPercent: null, paidSoFar: 0 })).toBe(8);
    expect(commissionPercent({ mode: "automatic", manualPercent: null, paidSoFar: 9 })).toBe(8);
  });
  it("automatic: 10% from 10 paid participants", () => {
    expect(commissionPercent({ mode: "automatic", manualPercent: null, paidSoFar: 10 })).toBe(10);
    expect(commissionPercent({ mode: "automatic", manualPercent: null, paidSoFar: 40 })).toBe(10);
  });
  it("manual: uses the typed percent, clamped to 8..10, 8 when missing", () => {
    expect(commissionPercent({ mode: "manual", manualPercent: 9.5, paidSoFar: 0 })).toBe(9.5);
    expect(commissionPercent({ mode: "manual", manualPercent: 12, paidSoFar: 0 })).toBe(10);
    expect(commissionPercent({ mode: "manual", manualPercent: 3, paidSoFar: 50 })).toBe(8);
    expect(commissionPercent({ mode: "manual", manualPercent: null, paidSoFar: 50 })).toBe(8);
  });
});

describe("commissionAmount", () => {
  it("rounds to 2 decimals", () => {
    expect(commissionAmount(9999, 8)).toBe(799.92);
  });
  it("is 0 for negative or non-finite amounts", () => {
    expect(commissionAmount(-5, 8)).toBe(0);
    expect(commissionAmount(NaN, 8)).toBe(0);
  });
});

describe("paidSoFar", () => {
  it("adds the imported count to live snapshots", () => {
    expect(paidSoFar(164, 3)).toBe(167);
    expect(paidSoFar(0, 0)).toBe(0);
  });
});

describe("balancePkr", () => {
  it("opening minus withdrawn plus PKR commissions", () => {
    expect(balancePkr({ openingCommission: 54032, openingWithdrawn: 4032, pkrCommissions: [800, 200.5] })).toBe(51000.5);
  });
});

describe("splitCommissions", () => {
  it("ignores voided rows and puts unconverted foreign money in waiting", () => {
    const r = splitCommissions([
      { currency: "PKR", commission: 800, commissionPkr: 800, voided: false },
      { currency: "PKR", commission: 500, commissionPkr: 500, voided: true },
      { currency: "AED", commission: 30, commissionPkr: null, voided: false },
      { currency: "AED", commission: 10, commissionPkr: null, voided: false },
    ]);
    expect(r.earnedPkr).toBe(800);
    expect(r.waiting).toEqual([{ currency: "AED", amount: 40 }]);
  });
  it("a foreign row with a converted PKR value counts as earned", () => {
    const r = splitCommissions([{ currency: "AED", commission: 30, commissionPkr: 2200, voided: false }]);
    expect(r.earnedPkr).toBe(2200);
    expect(r.waiting).toEqual([]);
  });
  it("sorts waiting by currency", () => {
    const r = splitCommissions([
      { currency: "SAR", commission: 5, commissionPkr: null, voided: false },
      { currency: "AED", commission: 1, commissionPkr: null, voided: false },
    ]);
    expect(r.waiting.map((w) => w.currency)).toEqual(["AED", "SAR"]);
  });
});
