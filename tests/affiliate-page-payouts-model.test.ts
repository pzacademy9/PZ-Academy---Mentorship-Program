import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => ({}) }));
vi.mock("@/lib/data/landing-agent-stats", () => ({ listPublishedLinkPages: vi.fn() }));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateRank: vi.fn(), getBoardToken: vi.fn() }));
vi.mock("@/lib/data/affiliate-payouts", () => ({ listAffiliateHistory: vi.fn() }));

import { buildPageModel } from "@/lib/data/affiliate-page";
import type { HistoryRow } from "@/lib/data/affiliate-payouts";

const NOW = new Date("2026-12-10T10:00:00Z");
const affiliate = {
  name: "Sara Khan", code: "SK321", team: "Blue", commissionMode: "automatic" as const, manualPercent: null as number | null,
  openingSecured: 0, openingCommission: 5000, openingWithdrawn: 0,
};
const pay = (status: HistoryRow["status"], amountPkr = 5000): HistoryRow => ({
  id: `p-${status}`, amountPkr, method: "jazzcash", accountMask: "•••• 1234", status, rejectReason: null,
  requestedAt: "2026-12-01T10:00:00Z", decidedAt: null,
});
const input = (payouts: HistoryRow[], over: Record<string, unknown> = {}) => ({
  affiliate, commissions: [], stats: [], pages: [], baseUrl: "https://pz.test", supportWa: "https://wa.me/1", now: NOW,
  rank: { all: null, month: null, boardUrl: "" }, payouts, ...over,
});

describe("buildPageModel: payouts take off the balance", () => {
  it("a pending payout holds the money", () => {
    const m = buildPageModel(input([pay("pending")]));
    expect(m.balancePkr).toBe(0);
    expect(m.payout.canRequest).toBe(false);
    expect(m.payout.pendingPkr).toBe(5000);
    expect(m.payout.minimum).toBe(3500);
  });
  it("a rejected payout returns the money", () => {
    const m = buildPageModel(input([pay("rejected")]));
    expect(m.balancePkr).toBe(5000);
    expect(m.payout.canRequest).toBe(true);
    expect(m.payout.pendingPkr).toBeNull();
  });
  it("a paid payout also reduces the balance", () => {
    const m = buildPageModel(input([pay("paid", 2000)]));
    expect(m.balancePkr).toBe(3000);
    expect(m.payout.pendingPkr).toBeNull();
  });
  it("carries the history through", () => {
    const h = [pay("paid", 1000), pay("rejected")];
    expect(buildPageModel(input(h)).payout.history).toEqual(h);
  });
  it("foreign-currency waiting amounts do not change the balance", () => {
    const m = buildPageModel(input([], { commissions: [{ currency: "AED", commission: 30, commissionPkr: null, voided: false, createdAt: "2026-12-05T10:00:00Z" }] }));
    expect(m.waiting).toEqual([{ currency: "AED", amount: 30 }]);
    expect(m.balancePkr).toBe(5000);
  });
});
