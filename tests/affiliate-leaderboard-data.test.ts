import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { getAffiliateBoard, getBoardToken, rotateBoardToken, isBoardToken, getAffiliateRank } from "@/lib/data/affiliate-leaderboard";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
// 15 November 2026, 10:00 UTC: the Pakistan month started 31 October 2026 19:00 UTC.
const NOW = new Date("2026-11-15T10:00:00Z");
const MONTH_START = "2026-10-31T19:00:00.000Z";

const rpcRows = [
  { affiliate_id: "a1", name: "Ali Khan", team: "Green", registered: "5", paid: "2" },
  { affiliate_id: "a2", name: "Sara Noor", team: "Blue", registered: "9", paid: "4" },
  { affiliate_id: "a3", name: "Zed", team: null, registered: "0", paid: "0" },
];
const serveBoard = () => {
  db.state.handler = (op) => (op.op === "rpc" ? { data: rpcRows, error: null } : { data: null, error: null });
};

beforeEach(() => db.reset());

describe("getAffiliateBoard", () => {
  it("asks for all time with p_from null", async () => {
    serveBoard();
    await getAffiliateBoard("all", NOW);
    const rpc = db.state.ops.find((o) => o.op === "rpc")!;
    expect(rpc.table).toBe("affiliate_leaderboard");
    expect(rpc.payload).toEqual({ p_from: null });
  });
  it("asks for this month with the Pakistan month start", async () => {
    serveBoard();
    await getAffiliateBoard("month", NOW);
    expect(db.state.ops.find((o) => o.op === "rpc")!.payload).toEqual({ p_from: MONTH_START });
  });
  it("turns string numbers into numbers and returns ranked rows and all five teams", async () => {
    serveBoard();
    const b = await getAffiliateBoard("all", NOW);
    expect(b.period).toBe("all");
    expect(b.rows.map((r) => [r.affiliateId, r.rank, r.paid, r.registered])).toEqual([
      ["a2", 1, 4, 9],
      ["a1", 2, 2, 5],
      ["a3", 3, 0, 0],
    ]);
    expect(b.rows[0].publicName).toBe("Sara N.");
    expect(b.teams).toHaveLength(5);
  });
  it("throws on an rpc error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "boom" } });
    await expect(getAffiliateBoard("all", NOW)).rejects.toBeTruthy();
  });
});

describe("board token", () => {
  const stored = "A".repeat(32);
  const serveToken = () => {
    db.state.handler = (op) => (op.table === "affiliate_board_link" && op.op === "select" ? { data: { token: stored }, error: null } : { data: null, error: null });
  };
  it("getBoardToken reads the single row", async () => {
    serveToken();
    expect(await getBoardToken()).toBe(stored);
  });
  it("getBoardToken throws on a read error or a missing row", async () => {
    db.state.handler = () => ({ data: null, error: { message: "x" } });
    await expect(getBoardToken()).rejects.toBeTruthy();
    db.state.handler = () => ({ data: null, error: null });
    await expect(getBoardToken()).rejects.toBeTruthy();
  });
  it("a malformed token is false and never reaches the database", async () => {
    serveToken();
    expect(await isBoardToken("short")).toBe(false);
    expect(await isBoardToken("has spaces and is long enough!!")).toBe(false);
    expect(await isBoardToken("")).toBe(false);
    expect(await isBoardToken("a".repeat(5000))).toBe(false);
    expect(db.state.ops.length).toBe(0);
  });
  it("the right token is true, a same-length wrong one is false, a different length is false without throwing", async () => {
    serveToken();
    expect(await isBoardToken(stored)).toBe(true);
    expect(await isBoardToken("B".repeat(32))).toBe(false);
    expect(await isBoardToken("A".repeat(31))).toBe(false);
    expect(await isBoardToken("A".repeat(33))).toBe(false);
  });
  it("rotateBoardToken writes a new well-shaped token and returns it", async () => {
    const t = await rotateBoardToken();
    expect(t).toMatch(TOKEN_RE);
    const w = db.state.ops.find((o) => o.table === "affiliate_board_link" && (o.op === "upsert" || o.op === "update"))!;
    expect(w.payload).toMatchObject({ token: t });
    expect((w.payload as { rotated_at?: string }).rotated_at).toBeTruthy();
    expect(await rotateBoardToken()).not.toBe(t);
  });
  it("rotateBoardToken throws on a write error", async () => {
    db.state.handler = () => ({ data: null, error: { message: "x" } });
    await expect(rotateBoardToken()).rejects.toBeTruthy();
  });
});

describe("getAffiliateRank", () => {
  it("is null for both periods when the affiliate is not on the board", async () => {
    serveBoard();
    expect(await getAffiliateRank("nope", NOW)).toEqual({ all: null, month: null });
  });
  it("gives rank, size, paid, a gap line and the team standing for one on the board", async () => {
    serveBoard();
    const r = await getAffiliateRank("a1", NOW);
    expect(r.all).toMatchObject({ rank: 2, of: 2, paid: 2, team: "Green" });
    expect(r.all!.line).toBe("3 more paid sales to pass Sara N.");
    expect(typeof r.all!.teamRank).toBe("number");
    expect(r.month).toMatchObject({ rank: 2 });
  });
  it("an affiliate with no paid sale is unranked (null), not 3rd of 3", async () => {
    serveBoard();
    const r = await getAffiliateRank("a3", NOW);
    expect(r).toEqual({ all: null, month: null });
  });
  it("an affiliate without a team has no team rank", async () => {
    db.state.handler = (op) =>
      op.op === "rpc" ? { data: [{ affiliate_id: "a9", name: "Solo Q", team: null, registered: "2", paid: "1" }], error: null } : { data: null, error: null };
    const r = await getAffiliateRank("a9", NOW);
    expect(r.all).toMatchObject({ team: null, teamRank: null, rank: 1, of: 1 });
  });
});
