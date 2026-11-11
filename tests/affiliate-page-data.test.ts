import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const pages = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/data/landing-agent-stats", () => ({ listPublishedLinkPages: pages.list }));
const lb = vi.hoisted(() => ({ rank: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateRank: lb.rank, getBoardToken: lb.token }));

import { buildPageModel, getAffiliatePageModel } from "@/lib/data/affiliate-page";

const affiliate = {
  name: "Sara Khan", code: "SK321", team: "Blue", commissionMode: "automatic" as const, manualPercent: null as number | null,
  openingSecured: 0, openingCommission: 0, openingWithdrawn: 0,
};
const pg = [
  { id: "p1", slug: "ppc-b4", title: "PPC Batch 4" },
  { id: "p2", slug: "mdc-b3", title: "MDC Batch 3" },
];
// "Now" is 10 December 2026, so this month is December and last month is November (after the November bridge).
const NOW = new Date("2026-12-10T10:00:00Z");
const THIS_MONTH = "2026-12-05T10:00:00Z";
const LAST_MONTH = "2026-11-05T10:00:00Z";
const com = (over: Partial<{ currency: string; commission: number; commissionPkr: number | null; voided: boolean; createdAt: string }> = {}) => ({
  currency: "PKR", commission: 800, commissionPkr: 800, voided: false, createdAt: THIS_MONTH, ...over,
});
const input = (over: Record<string, unknown> = {}) => ({
  affiliate, commissions: [] as ReturnType<typeof com>[], stats: [] as { pageId: string; views: number; registered: number; paid: number }[],
  pages: pg, baseUrl: "https://pz.test", supportWa: "https://wa.me/1", now: NOW,
  rank: { all: null, month: null, boardUrl: "" }, ...over,
});
const many = (n: number, over: Parameters<typeof com>[0] = {}) => Array.from({ length: n }, () => com(over));

describe("buildPageModel: percent and progress", () => {
  it("automatic: sales this month show progress this month, and the percent stays 8%", () => {
    const m = buildPageModel(input({ commissions: many(3) }));
    expect(m.automatic).toBe(true);
    expect(m.paidCount).toBe(3);
    expect(m.monthPaid).toBe(3);
    expect(m.lastMonthPaid).toBe(0);
    expect(m.percent).toBe(8);
    expect(m.toNextStep).toBe(7);
  });
  it("automatic: 10 paid last month means 10% this month, and this month starts its own count", () => {
    const m = buildPageModel(input({ commissions: [...many(10, { createdAt: LAST_MONTH }), ...many(2)] }));
    expect(m.lastMonthPaid).toBe(10);
    expect(m.percent).toBe(10);
    expect(m.monthPaid).toBe(2);
    expect(m.toNextStep).toBe(8);
  });
  it("automatic: 9 paid last month is still 8%", () => {
    const m = buildPageModel(input({ commissions: many(9, { createdAt: LAST_MONTH }) }));
    expect(m.percent).toBe(8);
  });
  it("automatic: 10 paid this month earns 10% next month, so no next step", () => {
    const m = buildPageModel(input({ commissions: many(10) }));
    expect(m.monthPaid).toBe(10);
    expect(m.toNextStep).toBeNull();
    expect(m.percent).toBe(8);
  });
  it("the all-time count still adds imported participants (used for the certificate)", () => {
    const m = buildPageModel(input({ affiliate: { ...affiliate, openingSecured: 8 }, commissions: many(2) }));
    expect(m.paidCount).toBe(10);
    expect(m.percent).toBe(8);
  });
  it("November bridge: an imported affiliate with 10 or more past sales is at 10% in November", () => {
    const m = buildPageModel(input({ affiliate: { ...affiliate, openingSecured: 12 }, now: new Date("2026-11-15T10:00:00Z") }));
    expect(m.percent).toBe(10);
  });
  it("a cancelled sale does not count", () => {
    const m = buildPageModel(input({ commissions: [com(), com({ voided: true })] }));
    expect(m.paidCount).toBe(1);
    expect(m.monthPaid).toBe(1);
  });
  it("manual: shows the typed percent and no next step", () => {
    const m = buildPageModel(input({ affiliate: { ...affiliate, commissionMode: "manual", manualPercent: 9 }, commissions: [com()] }));
    expect(m.automatic).toBe(false);
    expect(m.percent).toBe(9);
    expect(m.toNextStep).toBeNull();
  });
});

describe("buildPageModel: money", () => {
  it("earned is the imported amount plus new PKR commission; balance takes off what was withdrawn", () => {
    const m = buildPageModel(input({
      affiliate: { ...affiliate, openingCommission: 54032, openingWithdrawn: 4032 },
      commissions: [com({ commission: 800, commissionPkr: 800 }), com({ commission: 200.5, commissionPkr: 200.5 })],
    }));
    expect(m.earnedPkr).toBe(55032.5);
    expect(m.balancePkr).toBe(51000.5);
  });
  it("a foreign commission waits to be converted and stays out of the PKR numbers", () => {
    const m = buildPageModel(input({ commissions: [com(), com({ currency: "AED", commission: 30, commissionPkr: null }), com({ currency: "AED", commission: 10, commissionPkr: null })] }));
    expect(m.waiting).toEqual([{ currency: "AED", amount: 40 }]);
    expect(m.earnedPkr).toBe(800);
    expect(m.balancePkr).toBe(800);
  });
  it("a foreign commission the owner already converted counts as PKR", () => {
    const m = buildPageModel(input({ commissions: [com({ currency: "AED", commission: 30, commissionPkr: 2200 })] }));
    expect(m.earnedPkr).toBe(2200);
    expect(m.waiting).toEqual([]);
  });
});

describe("buildPageModel: links and totals", () => {
  it("one link per open course, with the numbers, even for a course with none", () => {
    const m = buildPageModel(input({ stats: [{ pageId: "p1", views: 12, registered: 3, paid: 2 }] }));
    expect(m.links).toEqual([
      { pageId: "p1", title: "PPC Batch 4", url: "https://pz.test/e/ppc-b4?ref=sk321", views: 12, registered: 3, paid: 2 },
      { pageId: "p2", title: "MDC Batch 3", url: "https://pz.test/e/mdc-b3?ref=sk321", views: 0, registered: 0, paid: 0 },
    ]);
  });
  it("totals add every course the affiliate has numbers for, including closed ones", () => {
    const m = buildPageModel(input({ stats: [
      { pageId: "p1", views: 12, registered: 3, paid: 2 },
      { pageId: "closed", views: 5, registered: 1, paid: 1 },
    ] }));
    expect(m.totals).toEqual({ views: 17, registered: 4, paid: 3 });
  });
  it("no open courses gives an empty list, not an error", () => {
    expect(buildPageModel(input({ pages: [] })).links).toEqual([]);
  });
  it("carries the name, code, team and support link", () => {
    const m = buildPageModel(input());
    expect(m).toMatchObject({ name: "Sara Khan", code: "SK321", team: "Blue", supportWa: "https://wa.me/1" });
  });
});

describe("buildPageModel: rank", () => {
  it("passes the rank through untouched", () => {
    const own = { rank: 3, of: 54, paid: 4, line: "2 more paid sales to pass Ali K.", teamRank: 2, team: "Blue" as const };
    const rank = { all: own, month: null, boardUrl: "https://pz.test/affiliate-board/tok" };
    expect(buildPageModel(input({ rank })).rank).toEqual(rank);
  });
});

describe("getAffiliatePageModel", () => {
  beforeEach(() => {
    lb.rank.mockReset().mockResolvedValue({ all: null, month: null });
    lb.token.mockReset().mockResolvedValue("boardtoken");
    db.reset();
    pages.list.mockReset().mockResolvedValue(pg);
    process.env.NEXT_PUBLIC_APP_URL = "https://pz.test/";
  });
  const token = "a".repeat(32);
  const serve = (status: string) => {
    db.state.handler = (op) => {
      if (op.table === "affiliates") {
        const t = op.filters.find((f) => f[0] === "eq" && f[1] === "token");
        return t?.[2] === token
          ? { data: { id: "aff-1", status, name: "Sara Khan", code: "SK321", team: "Blue", commission_mode: "automatic", manual_percent: null, opening_secured: 0, opening_commission: "100.00", opening_withdrawn: "0.00" }, error: null }
          : { data: null, error: null };
      }
      if (op.table === "affiliate_commissions") return { data: [{ currency: "PKR", commission: "800.00", commission_pkr: "800.00", voided_at: null, created_at: "2026-11-05T10:00:00Z" }], error: null };
      if (op.table === "affiliate_link_stats") return { data: [{ page_id: "p1", views: 4, registered: 2, paid: 1 }], error: null };
      return { data: null, error: null };
    };
  };

  it("gives the numbers for an accepted affiliate's token", async () => {
    serve("accepted");
    const m = await getAffiliatePageModel(token);
    expect(m).toMatchObject({ name: "Sara Khan", code: "SK321", earnedPkr: 900, balancePkr: 900, paidCount: 1 });
    expect(m?.links[0]).toMatchObject({ url: "https://pz.test/e/ppc-b4?ref=sk321", views: 4, registered: 2, paid: 1 });
  });
  it("asks the database for accepted affiliates only, and for the stats of that affiliate", async () => {
    serve("accepted");
    await getAffiliatePageModel(token);
    const first = db.state.ops.find((o) => o.table === "affiliates")!;
    expect(first.filters.some((f) => f[0] === "eq" && f[1] === "status" && f[2] === "accepted")).toBe(true);
    const rpc = db.state.ops.find((o) => o.op === "rpc")!;
    expect(rpc.payload).toEqual({ p_affiliate_id: "aff-1" });
  });
  it("gives null for an unknown token, a token of the wrong shape, an empty one and a huge one, without querying the last three", async () => {
    serve("accepted");
    expect(await getAffiliatePageModel("b".repeat(32))).toBeNull();
    db.state.ops.length = 0;
    expect(await getAffiliatePageModel("short")).toBeNull();
    expect(await getAffiliatePageModel("")).toBeNull();
    expect(await getAffiliatePageModel("a".repeat(5000))).toBeNull();
    expect(await getAffiliatePageModel("a".repeat(31) + "!")).toBeNull();
    expect(db.state.ops.length).toBe(0);
  });
  it("gives null for a dropped or left affiliate (the query itself asks for accepted only)", async () => {
    db.state.handler = (op) => {
      const s = op.filters.find((f) => f[0] === "eq" && f[1] === "status");
      return op.table === "affiliates" && s?.[2] === "accepted" ? { data: null, error: null } : { data: { id: "aff-1" }, error: null };
    };
    expect(await getAffiliatePageModel(token)).toBeNull();
  });
  it("lets a read error through, so the page shows an error and not a wrong 'no longer active'", async () => {
    db.state.handler = () => ({ data: null, error: { code: "57014", message: "x" } });
    await expect(getAffiliatePageModel(token)).rejects.toBeTruthy();
  });
  it("loads the rank for this affiliate and builds the board link", async () => {
    serve("accepted");
    const own = { rank: 3, of: 54, paid: 4, line: "x", teamRank: 2, team: "Blue" };
    lb.rank.mockResolvedValue({ all: own, month: null });
    const m = await getAffiliatePageModel(token);
    expect(lb.rank).toHaveBeenCalledWith("aff-1");
    expect(m?.rank).toEqual({ all: own, month: null, boardUrl: "https://pz.test/affiliate-board/boardtoken" });
  });
  it("a rank failure is logged and the rest of the page still loads, with the card hidden", async () => {
    serve("accepted");
    lb.rank.mockRejectedValue(new Error("rank down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await getAffiliatePageModel(token);
    expect(m).toMatchObject({ name: "Sara Khan", earnedPkr: 900 });
    expect(m?.rank).toEqual({ all: null, month: null, boardUrl: "" });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
  it("a board link failure also hides the card and keeps the page", async () => {
    serve("accepted");
    lb.token.mockRejectedValue(new Error("no link"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await getAffiliatePageModel(token);
    expect(m?.rank).toEqual({ all: null, month: null, boardUrl: "" });
    err.mockRestore();
  });
});
