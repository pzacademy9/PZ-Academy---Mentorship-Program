import { describe, it, expect } from "vitest";
import {
  commissionPercent,
  commissionAmount,
  paidSoFar,
  balancePkr,
  splitCommissions,
  monthKey,
  previousMonthKey,
  paidInMonth,
} from "@/lib/affiliates/commission";

const NOV = new Date("2026-11-15T10:00:00Z");
const DEC = new Date("2026-12-10T10:00:00Z");
const auto = (over: Partial<Parameters<typeof commissionPercent>[0]> = {}) =>
  commissionPercent({ mode: "automatic", manualPercent: null, lastMonthPaid: 0, openingSecured: 0, now: DEC, ...over });

describe("commissionPercent", () => {
  it("automatic: 8% when last month had fewer than 10 paid participants", () => {
    expect(auto({ lastMonthPaid: 0 })).toBe(8);
    expect(auto({ lastMonthPaid: 9 })).toBe(8);
  });
  it("automatic: 10% when last month had 10 or more", () => {
    expect(auto({ lastMonthPaid: 10 })).toBe(10);
    expect(auto({ lastMonthPaid: 40 })).toBe(10);
  });
  it("automatic: imported history does not count once the November bridge is over", () => {
    expect(auto({ openingSecured: 164, lastMonthPaid: 0, now: DEC })).toBe(8);
  });
  it("automatic: an imported affiliate with 10 or more past sales keeps 10% through November 2026", () => {
    expect(auto({ openingSecured: 12, lastMonthPaid: 0, now: NOV })).toBe(10);
    expect(auto({ openingSecured: 10, lastMonthPaid: 0, now: new Date("2026-11-30T18:59:59Z") })).toBe(10);
  });
  it("automatic: the bridge ends at midnight Pakistan time on 1 December", () => {
    expect(auto({ openingSecured: 12, lastMonthPaid: 0, now: new Date("2026-11-30T19:00:00Z") })).toBe(8);
  });
  it("automatic: fewer than 10 imported past sales gets no bridge", () => {
    expect(auto({ openingSecured: 9, lastMonthPaid: 0, now: NOV })).toBe(8);
  });
  it("manual: uses the typed percent, clamped to 8..10, 8 when missing", () => {
    const m = (manualPercent: number | null) =>
      commissionPercent({ mode: "manual", manualPercent, lastMonthPaid: 50, openingSecured: 50, now: DEC });
    expect(m(9.5)).toBe(9.5);
    expect(m(12)).toBe(10);
    expect(m(3)).toBe(8);
    expect(m(null)).toBe(8);
  });
});

describe("months (Pakistan time)", () => {
  it("monthKey uses Pakistan time, not UTC", () => {
    expect(monthKey("2026-11-30T18:59:59Z")).toBe("2026-11");
    expect(monthKey("2026-11-30T19:00:00Z")).toBe("2026-12");
  });
  it("previousMonthKey rolls over the year", () => {
    expect(previousMonthKey("2026-12")).toBe("2026-11");
    expect(previousMonthKey("2027-01")).toBe("2026-12");
  });
  it("paidInMonth counts live rows created in that month only", () => {
    const rows = [
      { createdAt: "2026-11-02T10:00:00Z", voided: false },
      { createdAt: "2026-11-20T10:00:00Z", voided: true },
      { createdAt: "2026-12-01T10:00:00Z", voided: false },
    ];
    expect(paidInMonth(rows, "2026-11")).toBe(1);
    expect(paidInMonth(rows, "2026-12")).toBe(1);
    expect(paidInMonth(rows, "2026-10")).toBe(0);
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
