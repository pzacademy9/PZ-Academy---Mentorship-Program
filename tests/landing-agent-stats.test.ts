import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const pagesResult = { data: [] as unknown[], error: null as unknown };
const pagesCalls: Array<[string, ...unknown[]]> = [];
function pagesChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) {
    chain[m] = (...a: unknown[]) => {
      pagesCalls.push([m, ...a]);
      return chain;
    };
  }
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(pagesResult).then(res);
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    rpc,
    from: (t: string) => {
      pagesCalls.push(["from", t]);
      return pagesChain();
    },
  }),
}));

import { countAgentStats, countLeaderboard, type StatRegistration } from "@/lib/landing/agent-stats-rules";
import { getAgentLinkStats, getLeaderboard, listPublishedLinkPages } from "@/lib/data/landing-agent-stats";

const NOW = new Date("2026-10-22T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

let n = 0;
function reg(o: Partial<StatRegistration>): StatRegistration {
  n += 1;
  return {
    id: `r${n}`, agentId: "a", pageId: "p1", rowType: "individual", isTest: false, status: "pending",
    createdAt: daysAgo(1), currency: "PKR", amountReceived: null, expectedAmount: 1000, ...o,
  };
}

describe("countAgentStats (pure counting rules)", () => {
  it("never counts member rows or test rows", () => {
    const rows = [
      reg({ rowType: "lead", status: "paid" }),
      reg({ rowType: "member", status: "paid" }),
      reg({ rowType: "member", status: "paid" }),
      reg({ isTest: true, status: "paid" }),
    ];
    const out = countAgentStats("a", { registrations: rows, views: [] });
    expect(out).toEqual([{ pageId: "p1", views: 0, registered: 1, paid: 1 }]);
  });

  it("a sale currently Pending is not paid", () => {
    const out = countAgentStats("a", { registrations: [reg({ status: "pending" })], views: [] });
    expect(out[0].paid).toBe(0);
    expect(out[0].registered).toBe(1);
  });

  it("views are distinct sessions of this agent per page", () => {
    const views = [
      { agentId: "a", pageId: "p1", sessionId: "s1" },
      { agentId: "a", pageId: "p1", sessionId: "s1" },
      { agentId: "a", pageId: "p1", sessionId: "s2" },
      { agentId: "b", pageId: "p1", sessionId: "s9" },
    ];
    const out = countAgentStats("a", { registrations: [], views });
    expect(out).toEqual([{ pageId: "p1", views: 2, registered: 0, paid: 0 }]);
  });

  it("never returns another agent's data", () => {
    const out = countAgentStats("a", {
      registrations: [reg({ agentId: "b", status: "paid", pageId: "p2" })],
      views: [{ agentId: "b", pageId: "p2", sessionId: "x" }],
    });
    expect(out).toEqual([]);
  });

  it("gives one entry per page the agent has any data for", () => {
    const out = countAgentStats("a", {
      registrations: [reg({ pageId: "p1" }), reg({ pageId: "p2", status: "paid" })],
      views: [{ agentId: "a", pageId: "p3", sessionId: "s" }],
    });
    expect(out.map((r) => r.pageId).sort()).toEqual(["p1", "p2", "p3"]);
  });
});

describe("countLeaderboard (pure counting rules)", () => {
  const agents = [{ id: "a", name: "Ali" }, { id: "b", name: "Bina" }, { id: "z", name: "Zed" }];
  const base = { agents, now: NOW };
  const find = (out: ReturnType<typeof countLeaderboard>, id: string) => out.find((r) => r.agentId === id)!;

  it("lists every agent, zeros included, sorted by paid then registered", () => {
    const out = countLeaderboard({
      ...base, range: "all",
      registrations: [reg({ agentId: "a" }), reg({ agentId: "a" }), reg({ agentId: "b", status: "paid" })],
      paidEvents: [],
    });
    expect(out.map((r) => r.agentId)).toEqual(["b", "a", "z"]);
    expect(out[2]).toEqual({ agentId: "z", name: "Zed", registered: 0, paid: 0, revenue: [] });
  });

  it("two currencies give two revenue entries and no total; amount_received wins over expected_amount", () => {
    const out = countLeaderboard({
      ...base, range: "all",
      registrations: [
        reg({ status: "paid", currency: "PKR", amountReceived: 900, expectedAmount: 1000 }),
        reg({ status: "paid", currency: "PKR", amountReceived: null, expectedAmount: 500 }),
        reg({ status: "paid", currency: "USD", amountReceived: null, expectedAmount: 20 }),
      ],
      paidEvents: [],
    });
    const a = find(out, "a");
    expect(a.paid).toBe(3);
    expect(a.revenue).toEqual([{ currency: "PKR", amount: 1400 }, { currency: "USD", amount: 20 }]);
  });

  it("a group counts once: the lead carries the sale and members add nothing", () => {
    const out = countLeaderboard({
      ...base, range: "all",
      registrations: [
        reg({ rowType: "lead", status: "paid", expectedAmount: 3000 }),
        reg({ rowType: "member", status: "paid", expectedAmount: 3000 }),
        reg({ rowType: "member", status: "paid", expectedAmount: 3000 }),
      ],
      paidEvents: [],
    });
    expect(find(out, "a")).toMatchObject({ registered: 1, paid: 1, revenue: [{ currency: "PKR", amount: 3000 }] });
  });

  it("Paid, Pending, Paid is dated by the first Paid", () => {
    const r = reg({ status: "paid", createdAt: daysAgo(20) });
    const events = [
      { registrationId: r.id, at: daysAgo(3) },
      { registrationId: r.id, at: daysAgo(10) },
      { registrationId: r.id, at: daysAgo(1) },
    ];
    // first Paid was 10 days ago: outside 7d, inside 30d
    const out7 = countLeaderboard({ ...base, range: "7d", registrations: [r], paidEvents: events });
    expect(find(out7, "a")).toMatchObject({ registered: 0, paid: 0 });
    const out30 = countLeaderboard({ ...base, range: "30d", registrations: [r], paidEvents: events });
    expect(find(out30, "a")).toMatchObject({ registered: 1, paid: 1 });
  });

  it("a sale currently Pending is not paid even with an earlier Paid event", () => {
    const r = reg({ status: "pending" });
    const out = countLeaderboard({ ...base, range: "all", registrations: [r], paidEvents: [{ registrationId: r.id, at: daysAgo(1) }] });
    expect(find(out, "a")).toMatchObject({ registered: 1, paid: 0, revenue: [] });
  });

  it("7d excludes a registration made 8 days ago and a Paid first made 8 days ago", () => {
    const old = reg({ status: "paid", createdAt: daysAgo(8) });
    const recent = reg({ status: "paid", createdAt: daysAgo(2) });
    const paidLongAgo = reg({ status: "paid", createdAt: daysAgo(2) });
    const out = countLeaderboard({
      ...base, range: "7d",
      registrations: [old, recent, paidLongAgo],
      paidEvents: [
        { registrationId: old.id, at: daysAgo(8) },
        { registrationId: recent.id, at: daysAgo(2) },
        { registrationId: paidLongAgo.id, at: daysAgo(8) },
      ],
    });
    // registered: recent + paidLongAgo; paid: only recent
    expect(find(out, "a")).toMatchObject({ registered: 2, paid: 1 });
  });

  it("a paid sale with no Paid event is dated by its registration date", () => {
    const r = reg({ status: "paid", createdAt: daysAgo(9) });
    const out = countLeaderboard({ ...base, range: "7d", registrations: [r], paidEvents: [] });
    expect(find(out, "a")).toMatchObject({ paid: 0 });
  });

  it("ignores sales with no agent or an unknown agent, member rows and test rows", () => {
    const out = countLeaderboard({
      ...base, range: "all",
      registrations: [
        reg({ agentId: null }), reg({ agentId: "ghost" }),
        reg({ rowType: "member", status: "paid" }), reg({ isTest: true, status: "paid" }),
      ],
      paidEvents: [],
    });
    expect(out.every((r) => r.registered === 0 && r.paid === 0)).toBe(true);
  });
});

describe("data functions", () => {
  beforeEach(() => {
    rpc.mockReset();
    pagesCalls.length = 0;
    pagesResult.data = [];
    pagesResult.error = null;
  });

  it("getAgentLinkStats calls the SQL function for this agent only and returns no revenue", async () => {
    rpc.mockResolvedValue({ data: [{ page_id: "p1", views: 4, registered: 2, paid: 1, revenue: 99 }], error: null });
    const out = await getAgentLinkStats("agent-1");
    expect(rpc).toHaveBeenCalledWith("landing_agent_link_stats", { p_agent_id: "agent-1" });
    expect(out).toEqual([{ pageId: "p1", views: 4, registered: 2, paid: 1 }]);
    expect(JSON.stringify(out)).not.toMatch(/revenue|amount/i);
  });

  it("getAgentLinkStats throws on a database error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getAgentLinkStats("a")).rejects.toBeTruthy();
  });

  it("getLeaderboard passes the window start (null for all) and maps revenue", async () => {
    rpc.mockResolvedValue({
      data: [
        { agent_id: "a", name: "Ali", registered: 3, paid: 1, revenue: [{ currency: "PKR", amount: "1400.50" }] },
        { agent_id: "b", name: "Bina", registered: 5, paid: 1, revenue: [] },
        { agent_id: "z", name: "Zed", registered: 0, paid: 0, revenue: null },
      ],
      error: null,
    });
    const out = await getLeaderboard("7d", NOW);
    expect(rpc).toHaveBeenCalledWith("landing_leaderboard", { p_from: daysAgo(7) });
    expect(out.map((r) => r.agentId)).toEqual(["b", "a", "z"]);
    expect(out[1].revenue).toEqual([{ currency: "PKR", amount: 1400.5 }]);
    expect(out[2].revenue).toEqual([]);

    await getLeaderboard("30d", NOW);
    expect(rpc).toHaveBeenLastCalledWith("landing_leaderboard", { p_from: daysAgo(30) });
    await getLeaderboard("all", NOW);
    expect(rpc).toHaveBeenLastCalledWith("landing_leaderboard", { p_from: null });
  });

  it("listPublishedLinkPages returns published pages only", async () => {
    pagesResult.data = [{ id: "p1", slug: "s", title: "T", extra: 1 }];
    const out = await listPublishedLinkPages();
    expect(out).toEqual([{ id: "p1", slug: "s", title: "T" }]);
    expect(pagesCalls).toContainEqual(["from", "landing_pages"]);
    expect(pagesCalls).toContainEqual(["eq", "status", "published"]);
  });
});

describe("migration 0083 (checked by text only, the SQL cannot run here)", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0083_agent_stats.sql"), "utf8");
  it("is safe to run twice and locked to the service role", () => {
    expect(sql).not.toMatch(/^create function/im);
    expect((sql.match(/create or replace function/g) ?? []).length).toBe(2);
    expect((sql.match(/security definer/g) ?? []).length).toBe(2);
    expect((sql.match(/set search_path = public/g) ?? []).length).toBe(2);
    expect(sql).toMatch(/revoke all on function public\.landing_agent_link_stats\(uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.landing_leaderboard\(timestamptz\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.landing_agent_link_stats\(uuid\) to service_role/);
    expect(sql).toMatch(/grant execute on function public\.landing_leaderboard\(timestamptz\) to service_role/);
    expect(sql).not.toMatch(/grant execute[^;]*to (anon|authenticated|public)\b/);
  });
  it("applies the counting rules", () => {
    expect(sql).toMatch(/row_type in \('individual', 'lead'\)/);
    expect(sql).toMatch(/is_test = false/);
    expect(sql).toMatch(/coalesce\(r\.amount_received, r\.expected_amount\)/);
    expect(sql).toMatch(/min\(e\.at\)/);
    expect(sql).toMatch(/e\.to_status = 'paid'/);
    expect(sql).toMatch(/count\(distinct f\.session_id\)/);
    expect(sql).toMatch(/f\.type = 'view'/);
    expect(sql).toMatch(/p\.role = 'sales_agent'/);
    expect(sql).toMatch(/group by ps\.aid, ps\.currency/);
    expect(sql).toMatch(/r\.status = 'paid'|s\.status = 'paid'/);
    expect(sql).not.toMatch(/\binto\b/i);
  });
});
