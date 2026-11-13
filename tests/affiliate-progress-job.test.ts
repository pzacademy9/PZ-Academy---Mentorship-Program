import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, filterValue, type Store, type Op, type Res } from "./helpers/supabase-mock";
import { rankAffiliates, rankTeams, type BoardRow } from "@/lib/affiliates/leaderboard";
import type { ProgressInput } from "@/lib/affiliates/rich-emails";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getAffiliateBoard: vi.fn(),
  sendProgress: vi.fn(),
  getEmailMessage: vi.fn(),
  countSentLast24h: vi.fn(),
}));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateBoard: m.getAffiliateBoard }));
vi.mock("@/lib/affiliates/send", () => ({ sendProgress: m.sendProgress }));
vi.mock("@/lib/data/affiliate-email-settings", () => ({ getEmailMessage: m.getEmailMessage }));
vi.mock("@/lib/data/affiliate-emails", () => ({ countSentLast24h: m.countSentLast24h }));

import { runProgressEmails } from "@/lib/data/affiliate-progress";

const NOW = new Date("2026-11-15T10:00:00Z");

type Aff = {
  id: string;
  name: string;
  code: string | null;
  team: string | null;
  email: string | null;
  status: string;
  commission_mode: string;
  manual_percent: string | null;
  opening_secured: number;
  opening_commission: string | number;
  opening_withdrawn: string | number;
};
const aff = (id: string, over: Partial<Aff> = {}) => ({
  id,
  name: `Name ${id}`,
  code: `CODE${id.toUpperCase()}`,
  team: "Green",
  email: `${id}@example.com`,
  status: "accepted",
  commission_mode: "automatic",
  manual_percent: null,
  opening_secured: 0,
  opening_commission: 0,
  opening_withdrawn: 0,
  ...over,
});
let seq = 0;
const com = (affiliateId: string, over: Record<string, unknown> = {}) => ({
  id: `c${++seq}`,
  affiliate_id: affiliateId,
  currency: "PKR",
  commission: 500,
  commission_pkr: null,
  voided_at: null,
  created_at: `2026-11-1${seq % 5}T08:00:00Z`,
  progress_emailed_at: null,
  progress_attempts: 0,
  ...over,
});

const board = (rows: BoardRow[]) => ({ period: "all", rows: rankAffiliates(rows), teams: rankTeams(rows) });
const brow = (affiliateId: string, paid: number, registered = paid, name = `Person ${affiliateId}`): BoardRow => ({
  affiliateId,
  name,
  team: "Green",
  registered,
  paid,
});

let store: Store;
const use = (s: Store, wrap?: (op: Op, base: (op: Op) => Res) => Res) => {
  store = s;
  const base = memoryHandler(store);
  db.state.handler = wrap ? (op) => wrap(op, base) : base;
};
const commissions = () => store.affiliate_commissions as Record<string, unknown>[];
const sentInput = (i = 0) => m.sendProgress.mock.calls[i][1] as ProgressInput;

beforeEach(() => {
  db.reset();
  seq = 0;
  for (const f of Object.values(m)) f.mockReset();
  m.sendProgress.mockResolvedValue(true);
  m.getEmailMessage.mockResolvedValue("Hello team");
  m.countSentLast24h.mockResolvedValue(0);
  m.getAffiliateBoard.mockResolvedValue(board([brow("a1", 3)]));
});

describe("runProgressEmails", () => {
  it("sends one email for an affiliate with three pending rows and marks all three", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1"), com("a1")] });
    const r = await runProgressEmails(NOW);
    expect(r).toEqual({ affiliates: 1, sent: 1, failed: 0, skipped: 0 });
    expect(m.sendProgress).toHaveBeenCalledTimes(1);
    expect(m.sendProgress.mock.calls[0][0]).toEqual({ id: "a1", name: "Name a1", email: "a1@example.com" });
    const input = sentInput();
    expect(input).toMatchObject({ name: "Name a1", code: "CODEA1", paid: 3, commissionPkr: 1500, balancePkr: 1500, percent: 8, rank: 1, message: "Hello team" });
    expect(input.gapLine).toBe("You are first.");
    expect(input.top).toEqual([{ rank: 1, publicName: "Person A.", team: "Green", paid: 3, isMe: true }]);
    expect(commissions().every((c) => c.progress_emailed_at === NOW.toISOString())).toBe(true);
    expect(commissions().every((c) => c.progress_attempts === 0)).toBe(true);
    expect(m.getAffiliateBoard).toHaveBeenCalledTimes(1);
    expect(m.getAffiliateBoard).toHaveBeenCalledWith("all", NOW);
  });

  it("claims with an atomic update guarded by progress_emailed_at is null before sending", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1")] });
    const order: string[] = [];
    m.sendProgress.mockImplementation(async () => {
      order.push("send");
      return true;
    });
    const wrap = db.state.handler;
    db.state.handler = (op) => {
      if (op.table === "affiliate_commissions" && op.op === "update") order.push("claim");
      return wrap(op);
    };
    await runProgressEmails(NOW);
    expect(order).toEqual(["claim", "send"]);
    const claim = db.find("affiliate_commissions", "update")[0];
    expect(claim.returning).toBe(true);
    expect(filterValue(claim, "is", "progress_emailed_at")).toBeNull();
    expect(filterValue(claim, "in", "id")).toEqual(["c1", "c2"]);
  });

  it("skips and marks rows of a dropped affiliate without sending", async () => {
    use({
      affiliates: [aff("a1", { status: "dropped" }), aff("a2", { code: null }), aff("a3", { email: null })],
      affiliate_commissions: [com("a1"), com("a1"), com("a2"), com("a3")],
    });
    const r = await runProgressEmails(NOW);
    expect(r).toEqual({ affiliates: 3, sent: 0, failed: 0, skipped: 3 });
    expect(m.sendProgress).not.toHaveBeenCalled();
    expect(commissions().every((c) => c.progress_emailed_at === NOW.toISOString() && c.progress_attempts === 0)).toBe(true);
  });

  it("releases the claim and adds one attempt when the send fails", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1", { progress_attempts: 2 })] });
    m.sendProgress.mockResolvedValue(false);
    const r = await runProgressEmails(NOW);
    expect(r).toEqual({ affiliates: 1, sent: 0, failed: 1, skipped: 0 });
    expect(commissions().map((c) => [c.progress_emailed_at, c.progress_attempts])).toEqual([
      [null, 1],
      [null, 3],
    ]);
  });

  it("releases only the rows it claimed, never rows it did not get", async () => {
    // c2 was taken by another run between the read and the claim.
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1")] }, (op, base) => {
      if (op.table === "affiliate_commissions" && op.op === "update" && filterValue(op, "is", "progress_emailed_at") === null) {
        const c2 = commissions().find((c) => c.id === "c2")!;
        if (c2.progress_emailed_at === null) c2.progress_emailed_at = "2026-11-15T09:59:59.000Z";
      }
      return base(op);
    });
    m.sendProgress.mockResolvedValue(false);
    await runProgressEmails(NOW);
    const [c1, c2] = commissions();
    expect([c1.progress_emailed_at, c1.progress_attempts]).toEqual([null, 1]);
    expect([c2.progress_emailed_at, c2.progress_attempts]).toEqual(["2026-11-15T09:59:59.000Z", 0]);
  });

  it("does not touch rows with 5 attempts", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1", { progress_attempts: 5 })] });
    const r = await runProgressEmails(NOW);
    expect(r).toEqual({ affiliates: 0, sent: 0, failed: 0, skipped: 0 });
    expect(m.sendProgress).not.toHaveBeenCalled();
    expect(db.find("affiliate_commissions", "update")).toHaveLength(0);
    expect(commissions()[0]).toMatchObject({ progress_emailed_at: null, progress_attempts: 5 });
  });

  it("ignores voided and already emailed rows", async () => {
    use({
      affiliates: [aff("a1")],
      affiliate_commissions: [com("a1", { voided_at: "2026-11-14T00:00:00Z" }), com("a1", { progress_emailed_at: "2026-11-14T00:00:00Z" })],
    });
    expect(await runProgressEmails(NOW)).toEqual({ affiliates: 0, sent: 0, failed: 0, skipped: 0 });
    expect(m.sendProgress).not.toHaveBeenCalled();
  });

  it("does not send when two runs claim the same rows (second claim returns nothing)", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1")] }, (op, base) => {
      if (op.table === "affiliate_commissions" && op.op === "update") return { data: [], error: null };
      return base(op);
    });
    const r = await runProgressEmails(NOW);
    expect(r).toEqual({ affiliates: 1, sent: 0, failed: 0, skipped: 1 });
    expect(m.sendProgress).not.toHaveBeenCalled();
    expect(db.find("affiliate_commissions", "update")).toHaveLength(1);
  });

  it("two real runs over the same rows send exactly once", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1")] });
    await runProgressEmails(NOW);
    const second = await runProgressEmails(NOW);
    expect(second).toEqual({ affiliates: 0, sent: 0, failed: 0, skipped: 0 });
    expect(m.sendProgress).toHaveBeenCalledTimes(1);
  });

  it("stops when the 24 hour count is 300 or more", async () => {
    use({ affiliates: [aff("a1"), aff("a2")], affiliate_commissions: [com("a1"), com("a2")] });
    m.countSentLast24h.mockResolvedValueOnce(299).mockResolvedValue(300);
    m.getAffiliateBoard.mockResolvedValue(board([brow("a1", 1), brow("a2", 1)]));
    const r = await runProgressEmails(NOW);
    expect(r.sent).toBe(1);
    expect(m.sendProgress).toHaveBeenCalledTimes(1);
    // The second affiliate's row is left unclaimed for the next run.
    expect(commissions().find((c) => c.affiliate_id === "a2")).toMatchObject({ progress_emailed_at: null, progress_attempts: 0 });
  });

  it("sends nothing at all when the count is already 300", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1")] });
    m.countSentLast24h.mockResolvedValue(300);
    const r = await runProgressEmails(NOW);
    expect(r.sent).toBe(0);
    expect(m.sendProgress).not.toHaveBeenCalled();
    expect(db.find("affiliate_commissions", "update")).toHaveLength(0);
  });

  it("puts the affiliate's own row after the top 10 when they rank below 10", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => brow(`b${i}`, 20 - i, 20 - i, `Top${i} Person`));
    rows.push(brow("a1", 2, 2, "Ali Khan"));
    rows.push(brow("z0", 0, 4, "No Sale"));
    m.getAffiliateBoard.mockResolvedValue(board(rows));
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1"), com("a1")] });
    await runProgressEmails(NOW);
    const input = sentInput();
    expect(input.top).toHaveLength(11);
    expect(input.top.slice(0, 10).every((t) => !t.isMe)).toBe(true);
    expect(input.top[10]).toEqual({ rank: 13, publicName: "Ali K.", team: "Green", paid: 2, isMe: true });
    expect(input.rank).toBe(13);
    expect(input.gapLine).toBe("8 more paid sales to pass Top11 P.");
    // Privacy: only rank, public name, team, paid and isMe.
    for (const t of input.top) expect(Object.keys(t).sort()).toEqual(["isMe", "paid", "publicName", "rank", "team"]);
  });

  it("marks the affiliate inside the top 10 without appending a duplicate", async () => {
    m.getAffiliateBoard.mockResolvedValue(board([brow("b1", 5), brow("a1", 3), brow("b2", 1), brow("z", 0)]));
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1")] });
    await runProgressEmails(NOW);
    const top = sentInput().top;
    expect(top.map((t) => [t.rank, t.isMe])).toEqual([
      [1, false],
      [2, true],
      [3, false],
    ]);
  });

  it("works when the board has fewer than 10 ranked rows and when the affiliate is the only one", async () => {
    m.getAffiliateBoard.mockResolvedValue(board([brow("a1", 1)]));
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1")] });
    await runProgressEmails(NOW);
    expect(sentInput().top).toEqual([{ rank: 1, publicName: "Person A.", team: "Green", paid: 1, isMe: true }]);
    expect(sentInput().rank).toBe(1);
    expect(sentInput().gapLine).toBe("You are first.");
  });

  it("keeps the null rank path when the affiliate is not on the board", async () => {
    m.getAffiliateBoard.mockResolvedValue(board([brow("b1", 2)]));
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1")] });
    await runProgressEmails(NOW);
    expect(sentInput().rank).toBeNull();
    expect(sentInput().gapLine).toBe("Get your first paid sale to join the race.");
    expect(sentInput().top.every((t) => !t.isMe)).toBe(true);
  });

  it("matches the private page numbers: opening history, voided rows, foreign currency, manual percent", async () => {
    use({
      affiliates: [aff("a1", { commission_mode: "manual", manual_percent: "9", opening_secured: 4, opening_commission: "2000", opening_withdrawn: "500" })],
      affiliate_commissions: [
        com("a1"),
        com("a1", { currency: "USD", commission: 5, commission_pkr: "1400" }),
        com("a1", { currency: "USD", commission: 5 }),
        com("a1", { voided_at: "2026-11-14T00:00:00Z", progress_emailed_at: "x" }),
      ],
    });
    await runProgressEmails(NOW);
    // paid = 4 opening + 3 live; earned = 2000 + 500 + 1400; balance = earned - 500.
    expect(sentInput()).toMatchObject({ paid: 7, percent: 9, commissionPkr: 3900, balancePkr: 3400 });
  });

  it("takes pending and paid payouts off the emailed balance, not rejected ones", async () => {
    use({
      affiliates: [aff("a1")],
      affiliate_commissions: [com("a1", { commission_pkr: 2000, commission: 2000 })],
      affiliate_payouts: [
        { id: "p1", affiliate_id: "a1", amount_pkr: 500, status: "pending" },
        { id: "p2", affiliate_id: "a1", amount_pkr: 300, status: "paid" },
        { id: "p3", affiliate_id: "a1", amount_pkr: 900, status: "rejected" },
        { id: "p4", affiliate_id: "a2", amount_pkr: 700, status: "paid" },
      ],
    });
    await runProgressEmails(NOW);
    expect(sentInput()).toMatchObject({ commissionPkr: 2000, balancePkr: 1200 });
  });

  it("a failed payouts read does not stop the email: held falls back to 0 and the error is logged", async () => {
    use({ affiliates: [aff("a1")], affiliate_commissions: [com("a1")] }, (op, base) =>
      op.table === "affiliate_payouts" ? { data: null, error: { message: "boom" } } : base(op),
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await runProgressEmails(NOW);
    expect(r.sent).toBe(1);
    expect(sentInput().balancePkr).toBe(500);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("uses last month for the automatic percent", async () => {
    const oct = Array.from({ length: 10 }, () => com("a1", { created_at: "2026-10-10T08:00:00Z", progress_emailed_at: "2026-10-10T09:00:00Z" }));
    use({ affiliates: [aff("a1")], affiliate_commissions: [...oct, com("a1", { created_at: "2026-11-14T08:00:00Z" })] });
    await runProgressEmails(NOW);
    expect(sentInput().percent).toBe(10);
  });

  it("stops starting new affiliates once the time budget has passed", async () => {
    use({
      affiliates: [aff("a1"), aff("a2"), aff("a3")],
      affiliate_commissions: [com("a1"), com("a2"), com("a3")],
    });
    m.getAffiliateBoard.mockResolvedValue(board([brow("a1", 1), brow("a2", 1), brow("a3", 1)]));
    // Run start = 0; the first affiliate is checked at 1s, the second at 41s (past the 40s budget).
    const ticks = [0, 1_000, 41_000, 42_000, 43_000];
    let i = 0;
    const clock = () => ticks[Math.min(i++, ticks.length - 1)];
    const r = await runProgressEmails(NOW, { clock });
    expect(r).toEqual({ affiliates: 1, sent: 1, failed: 0, skipped: 0 });
    expect(m.sendProgress).toHaveBeenCalledTimes(1);
    // The rest stay pending for the next run.
    expect(commissions().filter((c) => c.progress_emailed_at === null)).toHaveLength(2);
  });

  it("processes at most 40 affiliates, oldest first", async () => {
    const affs = Array.from({ length: 45 }, (_, i) => aff(`x${String(i).padStart(2, "0")}`));
    const rows = affs.map((a, i) => com(a.id, { created_at: new Date(Date.UTC(2026, 10, 1, 0, 45 - i)).toISOString() }));
    use({ affiliates: affs, affiliate_commissions: rows });
    const r = await runProgressEmails(NOW);
    expect(r.affiliates).toBe(40);
    expect(m.sendProgress).toHaveBeenCalledTimes(40);
    // The 5 newest (x00..x04) wait for the next run.
    const waiting = commissions().filter((c) => c.progress_emailed_at === null).map((c) => c.affiliate_id);
    expect(waiting.sort()).toEqual(["x00", "x01", "x02", "x03", "x04"]);
  });
});
