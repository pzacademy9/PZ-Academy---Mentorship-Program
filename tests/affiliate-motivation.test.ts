import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createSupabaseMock, memoryHandler, filterValue, type Store, type Op, type Res } from "./helpers/supabase-mock";
import { rankAffiliates, rankTeams, type BoardRow } from "@/lib/affiliates/leaderboard";
import type { MotivationInput } from "@/lib/affiliates/rich-emails";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown, area: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: async (area: unknown) => {
    gate.area = area;
    return gate.result;
  },
}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const m = vi.hoisted(() => ({
  getAffiliateBoard: vi.fn(),
  sendMotivation: vi.fn(),
  countSentLast24h: vi.fn(),
}));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateBoard: m.getAffiliateBoard }));
vi.mock("@/lib/affiliates/send", () => ({ sendMotivation: m.sendMotivation }));
vi.mock("@/lib/data/affiliate-emails", () => ({ countSentLast24h: m.countSentLast24h }));

import { listMotivationCandidates, sendMotivationBatch } from "@/lib/data/affiliate-motivation";
import { GET, POST } from "@/app/api/admin/affiliates/motivation/route";

type Aff = { id: string; name: string; code: string | null; email: string | null; status: string; motivation_emailed_at: string | null };
const aff = (id: string, over: Partial<Aff> = {}): Aff => ({
  id,
  name: `Name ${id}`,
  code: `CODE${id.toUpperCase()}`,
  email: `${id}@example.com`,
  status: "accepted",
  motivation_emailed_at: null,
  ...over,
});
const brow = (affiliateId: string, paid: number, name = `Person ${affiliateId}`): BoardRow => ({
  affiliateId,
  name,
  team: "Green",
  registered: paid,
  paid,
});
const board = (rows: BoardRow[]) => ({ period: "all", rows: rankAffiliates(rows), teams: rankTeams(rows) });

let store: Store;
const use = (s: Store, wrap?: (op: Op, base: (op: Op) => Res) => Res) => {
  store = s;
  const base = memoryHandler(store);
  db.state.handler = wrap ? (op) => wrap(op, base) : base;
};
const affs = () => store.affiliates as Aff[];
const row = (id: string) => affs().find((a) => a.id === id)!;
const sentTo = () => m.sendMotivation.mock.calls.map((c) => (c[0] as { id: string }).id);
const sentInput = (i = 0) => m.sendMotivation.mock.calls[i][1] as MotivationInput;

const post = (body: unknown) =>
  POST(new Request("http://x/api/admin/affiliates/motivation", { method: "POST", body: JSON.stringify(body) }));
const get = (qs = "") => GET(new Request(`http://x/api/admin/affiliates/motivation${qs}`));

beforeEach(() => {
  db.reset();
  gate.result = { ok: true, user: { id: "u" } };
  for (const f of Object.values(m)) f.mockReset();
  m.sendMotivation.mockResolvedValue(true);
  m.countSentLast24h.mockResolvedValue(0);
  m.getAffiliateBoard.mockResolvedValue(
    board([brow("lead", 7, "Sara Ahmed"), brow("b2", 3, "Omar Farooq"), brow("z1", 0), brow("z2", 0), brow("z3", 0)]),
  );
});

describe("listMotivationCandidates", () => {
  it("candidates are accepted affiliates with zero paid, sorted, without those already sent", async () => {
    use({
      affiliates: [
        aff("z3", { name: "Zara" }),
        aff("z1", { name: "Bilal" }),
        aff("z2", { name: "Ayesha", email: null }),
        aff("lead", { name: "Sara Ahmed" }),
        aff("drop", { name: "Dropped", status: "dropped" }),
        aff("sent", { name: "Already", motivation_emailed_at: "2026-11-10T00:00:00.000Z" }),
      ],
    });
    const list = await listMotivationCandidates(false);
    expect(list).toEqual([
      { id: "z2", name: "Ayesha", email: null, sentAt: null },
      { id: "z1", name: "Bilal", email: "z1@example.com", sentAt: null },
      { id: "z3", name: "Zara", email: "z3@example.com", sentAt: null },
    ]);
    expect(m.getAffiliateBoard).toHaveBeenCalledWith("all");
  });

  it("includeSent shows them again", async () => {
    use({ affiliates: [aff("z1", { name: "Bilal" }), aff("sent", { name: "Already", motivation_emailed_at: "2026-11-10T00:00:00.000Z" })] });
    const list = await listMotivationCandidates(true);
    expect(list).toEqual([
      { id: "sent", name: "Already", email: "sent@example.com", sentAt: "2026-11-10T00:00:00.000Z" },
      { id: "z1", name: "Bilal", email: "z1@example.com", sentAt: null },
    ]);
  });
});

describe("sendMotivationBatch", () => {
  it("sends to each eligible person, claims before sending, and builds the leader line and top 5 without money", async () => {
    m.getAffiliateBoard.mockResolvedValue(
      board([
        brow("lead", 7, "Sara Ahmed"),
        brow("b2", 6, "Omar Farooq"),
        brow("b3", 5, "Ali Khan"),
        brow("b4", 4, "Hina Raza"),
        brow("b5", 3, "Usman Tariq"),
        brow("b6", 2, "Noor Ali"),
        brow("z1", 0),
      ]),
    );
    use({ affiliates: [aff("z1")] });
    const order: string[] = [];
    m.sendMotivation.mockImplementation(async () => {
      order.push("send");
      return true;
    });
    const wrap = db.state.handler;
    db.state.handler = (op) => {
      if (op.table === "affiliates" && op.op === "update") order.push("claim");
      return wrap(op);
    };
    const r = await sendMotivationBatch(["z1"], { includeSent: false });
    expect(r).toEqual({ sent: 1, failed: 0, skipped: 0, limitReached: false, remainingToday: 250 });
    expect(order).toEqual(["claim", "send"]);
    const claim = db.find("affiliates", "update")[0];
    expect(claim.returning).toBe(true);
    expect(filterValue(claim, "eq", "id")).toBe("z1");
    expect(filterValue(claim, "is", "motivation_emailed_at")).toBeNull();
    expect(typeof row("z1").motivation_emailed_at).toBe("string");
    expect(m.sendMotivation.mock.calls[0][0]).toEqual({ id: "z1", name: "Name z1", email: "z1@example.com" });
    const input = sentInput();
    expect(input.name).toBe("Name z1");
    expect(input.code).toBe("CODEZ1");
    expect(input.leaderLine).toBe("Current leader: Sara A. with 7 paid participants");
    expect(input.top).toHaveLength(5);
    expect(input.top[0]).toEqual({ rank: 1, publicName: "Sara A.", team: "Green", paid: 7, isMe: false });
    expect(input.top.every((t) => !t.isMe && t.paid >= 1)).toBe(true);
    for (const t of input.top) expect(Object.keys(t).sort()).toEqual(["isMe", "paid", "publicName", "rank", "team"]);
    expect(input.supportWa).toMatch(/^https:\/\//);
  });

  it("has no leader line and an empty top when nobody has a paid sale", async () => {
    m.getAffiliateBoard.mockResolvedValue(board([brow("z1", 0)]));
    use({ affiliates: [aff("z1")] });
    await sendMotivationBatch(["z1"], { includeSent: false });
    expect(sentInput().leaderLine).toBeNull();
    expect(sentInput().top).toEqual([]);
  });

  it("a person who now has a paid sale is skipped even if the screen still lists them", async () => {
    use({ affiliates: [aff("b2"), aff("z1")] });
    const r = await sendMotivationBatch(["b2", "z1"], { includeSent: false });
    expect(r).toMatchObject({ sent: 1, skipped: 1, failed: 0 });
    expect(sentTo()).toEqual(["z1"]);
    expect(row("b2").motivation_emailed_at).toBeNull();
  });

  it("skips people who are not accepted, have no email or code, are unknown, or were already sent", async () => {
    use({
      affiliates: [
        aff("z1", { status: "dropped" }),
        aff("z2", { email: null }),
        aff("z3", { code: null }),
        aff("s1", { motivation_emailed_at: "2026-11-10T00:00:00.000Z" }),
      ],
    });
    const r = await sendMotivationBatch(["z1", "z2", "z3", "s1", "ghost"], { includeSent: false });
    expect(r).toMatchObject({ sent: 0, failed: 0, skipped: 5 });
    expect(m.sendMotivation).not.toHaveBeenCalled();
    expect(db.find("affiliates", "update")).toHaveLength(0);
  });

  it("a failed send leaves motivation_emailed_at as it was", async () => {
    use({ affiliates: [aff("z1"), aff("s1", { motivation_emailed_at: "2026-11-10T00:00:00.000Z" })] });
    m.sendMotivation.mockResolvedValue(false);
    const r = await sendMotivationBatch(["z1", "s1"], { includeSent: true });
    expect(r).toMatchObject({ sent: 0, failed: 2, skipped: 0 });
    expect(row("z1").motivation_emailed_at).toBeNull();
    expect(row("s1").motivation_emailed_at).toBe("2026-11-10T00:00:00.000Z");
  });

  it("a thrown send also gives the claim back, and one failure does not stop the rest", async () => {
    use({ affiliates: [aff("z1"), aff("z2")] });
    m.sendMotivation.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(true);
    const r = await sendMotivationBatch(["z1", "z2"], { includeSent: false });
    expect(r).toMatchObject({ sent: 1, failed: 1, skipped: 0 });
    expect(row("z1").motivation_emailed_at).toBeNull();
    expect(typeof row("z2").motivation_emailed_at).toBe("string");
  });

  it("a second identical call right after the first sends nothing (claim)", async () => {
    use({ affiliates: [aff("z1"), aff("z2")] });
    await sendMotivationBatch(["z1", "z2"], { includeSent: false });
    const second = await sendMotivationBatch(["z1", "z2"], { includeSent: false });
    expect(second).toMatchObject({ sent: 0, failed: 0, skipped: 2 });
    expect(m.sendMotivation).toHaveBeenCalledTimes(2);
  });

  it("does not send when another call claimed the person between the read and the claim", async () => {
    use({ affiliates: [aff("z1")] }, (op, base) => {
      if (op.table === "affiliates" && op.op === "update") return { data: [], error: null };
      return base(op);
    });
    const r = await sendMotivationBatch(["z1"], { includeSent: false });
    expect(r).toMatchObject({ sent: 0, skipped: 1 });
    expect(m.sendMotivation).not.toHaveBeenCalled();
  });

  it("includeSent resends to someone already sent and moves the timestamp", async () => {
    use({ affiliates: [aff("s1", { motivation_emailed_at: "2026-11-10T00:00:00.000Z" })] });
    const r = await sendMotivationBatch(["s1"], { includeSent: true });
    expect(r).toMatchObject({ sent: 1, skipped: 0 });
    expect(row("s1").motivation_emailed_at).not.toBe("2026-11-10T00:00:00.000Z");
  });

  it("ignores duplicate ids in one request", async () => {
    use({ affiliates: [aff("z1")] });
    const r = await sendMotivationBatch(["z1", "z1", "z1"], { includeSent: true });
    expect(r).toMatchObject({ sent: 1, skipped: 0 });
    expect(m.sendMotivation).toHaveBeenCalledTimes(1);
  });

  it("stops at 250 and says limitReached", async () => {
    use({ affiliates: [aff("z1"), aff("z2"), aff("z3")] });
    m.countSentLast24h.mockResolvedValueOnce(249).mockResolvedValue(250);
    const r = await sendMotivationBatch(["z1", "z2", "z3"], { includeSent: false });
    expect(r).toEqual({ sent: 1, failed: 0, skipped: 0, limitReached: true, remainingToday: 0 });
    expect(sentTo()).toEqual(["z1"]);
    // The rest are left unclaimed for tomorrow.
    expect(row("z2").motivation_emailed_at).toBeNull();
    expect(row("z3").motivation_emailed_at).toBeNull();
  });

  it("sends nothing when the count is already over 250 and reports 0 left", async () => {
    use({ affiliates: [aff("z1")] });
    m.countSentLast24h.mockResolvedValue(290);
    const r = await sendMotivationBatch(["z1"], { includeSent: false });
    expect(r).toEqual({ sent: 0, failed: 0, skipped: 0, limitReached: true, remainingToday: 0 });
    expect(db.find("affiliates", "update")).toHaveLength(0);
  });

  it("rejects more than 25 ids without touching anything", async () => {
    use({ affiliates: [aff("z1")] });
    const ids = Array.from({ length: 26 }, (_, i) => `x${i}`);
    await expect(sendMotivationBatch(ids, { includeSent: false })).rejects.toThrow();
    expect(db.state.ops).toHaveLength(0);
    expect(m.sendMotivation).not.toHaveBeenCalled();
  });
});

describe("/api/admin/affiliates/motivation", () => {
  it("route is admin only", async () => {
    gate.result = { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    use({ affiliates: [aff("z1")] });
    expect((await post({ ids: ["z1"] })).status).toBe(403);
    expect(gate.area).toBe("sales_hub");
    expect((await get()).status).toBe(403);
    expect(db.state.ops).toHaveLength(0);
    expect(m.sendMotivation).not.toHaveBeenCalled();
    expect(m.getAffiliateBoard).not.toHaveBeenCalled();
  });

  it("rejects more than 25 ids", async () => {
    use({ affiliates: [aff("z1")] });
    const res = await post({ ids: Array.from({ length: 26 }, (_, i) => `x${i}`) });
    expect(res.status).toBe(400);
    expect(db.state.ops).toHaveLength(0);
    expect(m.sendMotivation).not.toHaveBeenCalled();
  });

  it("rejects a bad body", async () => {
    use({ affiliates: [] });
    expect((await post({})).status).toBe(400);
    expect((await post({ ids: [] })).status).toBe(400);
    expect((await post({ ids: [5] })).status).toBe(400);
    expect((await post({ ids: ["z1"], includeSent: "yes" })).status).toBe(400);
    const bad = await POST(new Request("http://x/api/admin/affiliates/motivation", { method: "POST", body: "{" }));
    expect(bad.status).toBe(400);
    expect(db.state.ops).toHaveLength(0);
  });

  it("POST returns the batch result", async () => {
    use({ affiliates: [aff("z1"), aff("s1", { motivation_emailed_at: "2026-11-10T00:00:00.000Z" })] });
    const res = await post({ ids: ["z1", "s1"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1, failed: 0, skipped: 1, limitReached: false, remainingToday: 250 });
    const again = await post({ ids: ["s1"], includeSent: true });
    expect(await again.json()).toMatchObject({ sent: 1 });
  });

  it("GET returns the candidate list, with includeSent=1 adding those already sent", async () => {
    use({ affiliates: [aff("z1", { name: "Bilal" }), aff("s1", { name: "Already", motivation_emailed_at: "2026-11-10T00:00:00.000Z" })] });
    expect(await (await get()).json()).toEqual({ candidates: [{ id: "z1", name: "Bilal", email: "z1@example.com", sentAt: null }] });
    const all = await (await get("?includeSent=1")).json();
    expect(all.candidates.map((c: { id: string }) => c.id)).toEqual(["s1", "z1"]);
  });

  it("a failure gives a generic 500", async () => {
    use({ affiliates: [] });
    m.getAffiliateBoard.mockRejectedValue(new Error("secret db detail"));
    const g = await get();
    expect(g.status).toBe(500);
    expect(JSON.stringify(await g.json())).not.toContain("secret");
    const p = await post({ ids: ["z1"] });
    expect(p.status).toBe(500);
    expect(JSON.stringify(await p.json())).not.toContain("secret");
  });
});

describe("motivation send history", () => {
  const H = "affiliate_motivation_sends";
  const SID = "11111111-1111-4111-8111-111111111111";
  const hist = () => (store[H] ?? []) as Record<string, unknown>[];

  it("two chunks with the same sendId make one row with summed counts and both name lists", async () => {
    use({ affiliates: [aff("z1"), aff("z2"), aff("z3")], [H]: [] });
    m.sendMotivation.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValue(true);
    await sendMotivationBatch(["z1", "z2"], { includeSent: false, sendId: SID });
    await sendMotivationBatch(["z3"], { includeSent: false, sendId: SID });
    expect(hist()).toHaveLength(1);
    expect(hist()[0]).toMatchObject({
      id: SID,
      recipient_count: 2,
      failed_count: 1,
      recipients: [
        { name: "Name z1", ok: true },
        { name: "Name z2", ok: false },
        { name: "Name z3", ok: true },
      ],
    });
    expect(typeof hist()[0].subject).toBe("string");
    expect(String(hist()[0].html)).toContain("Name z1");
  });

  it("writes no row when nothing was attempted, or when there is no sendId", async () => {
    use({ affiliates: [aff("z1", { status: "dropped" }), aff("z2")], [H]: [] });
    await sendMotivationBatch(["z1"], { includeSent: false, sendId: SID });
    expect(hist()).toHaveLength(0);
    m.countSentLast24h.mockResolvedValue(290);
    await sendMotivationBatch(["z2"], { includeSent: false, sendId: SID });
    expect(hist()).toHaveLength(0);
    m.countSentLast24h.mockResolvedValue(0);
    await sendMotivationBatch(["z2"], { includeSent: false });
    expect(hist()).toHaveLength(0);
    expect(db.find(H, "insert")).toHaveLength(0);
  });

  it("a failing history save never changes the returned counts", async () => {
    use({ affiliates: [aff("z1")], [H]: [] }, (op, base) => {
      if (op.table === H) throw new Error("history down");
      return base(op);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await sendMotivationBatch(["z1"], { includeSent: false, sendId: SID });
    expect(r).toEqual({ sent: 1, failed: 0, skipped: 0, limitReached: false, remainingToday: 250 });
  });

  it("the POST route rejects a sendId that is not a uuid string and passes a good one on", async () => {
    use({ affiliates: [aff("z1")], [H]: [] });
    expect((await post({ ids: ["z1"], sendId: 5 })).status).toBe(400);
    expect((await post({ ids: ["z1"], sendId: "not-a-uuid" })).status).toBe(400);
    expect(m.sendMotivation).not.toHaveBeenCalled();
    const ok = await post({ ids: ["z1"], sendId: SID });
    expect(ok.status).toBe(200);
    expect(hist()).toHaveLength(1);
  });
});
