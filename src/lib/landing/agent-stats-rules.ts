// src/lib/landing/agent-stats-rules.ts
// The counting rules for agent numbers, written over plain rows. The live numbers come from the SQL
// functions in supabase/migrations/0083_agent_stats.sql, which follow exactly these rules; this file
// is the executable copy the tests check, so a change to one must be made in the other.
//
//  * One sale = a lead or individual row, not a test row. Member rows are never counted.
//  * registered = sales by created_at; paid = sales that are Paid right now.
//  * In a window a paid sale is dated by its earliest Paid status event (else its created_at).
//  * Revenue = amount_received if set, else expected_amount, per currency, never converted.
//  * Views = distinct session ids of this agent's view events, per page.

export type StatRegistration = {
  id: string;
  agentId: string | null;
  pageId: string;
  rowType: "individual" | "lead" | "member";
  isTest: boolean;
  status: string;
  createdAt: string;
  currency: string;
  amountReceived: number | null;
  expectedAmount: number;
};
export type StatPaidEvent = { registrationId: string; at: string };
export type StatView = { agentId: string | null; pageId: string; sessionId: string };

export type LinkStat = { pageId: string; views: number; registered: number; paid: number };
export type LeaderRow = {
  agentId: string;
  name: string;
  registered: number;
  paid: number;
  revenue: { currency: string; amount: number }[];
};
export type LeaderRange = "7d" | "30d" | "all";

const isSale = (r: StatRegistration) => !r.isTest && (r.rowType === "individual" || r.rowType === "lead");

export function countAgentStats(
  agentId: string,
  input: { registrations: StatRegistration[]; views: StatView[] },
): LinkStat[] {
  const pages = new Map<string, { sessions: Set<string>; registered: number; paid: number }>();
  const slot = (pageId: string) => {
    let s = pages.get(pageId);
    if (!s) pages.set(pageId, (s = { sessions: new Set(), registered: 0, paid: 0 }));
    return s;
  };
  for (const v of input.views) if (v.agentId === agentId) slot(v.pageId).sessions.add(v.sessionId);
  for (const r of input.registrations) {
    if (r.agentId !== agentId || !isSale(r)) continue;
    const s = slot(r.pageId);
    s.registered += 1;
    if (r.status === "paid") s.paid += 1;
  }
  return Array.from(pages).map(([pageId, s]) => ({ pageId, views: s.sessions.size, registered: s.registered, paid: s.paid }));
}

export function windowStart(range: LeaderRange, now: Date): Date | null {
  if (range === "all") return null;
  return new Date(now.getTime() - (range === "7d" ? 7 : 30) * 86_400_000);
}

export function sortLeaders(rows: LeaderRow[]): LeaderRow[] {
  return [...rows].sort((a, b) => b.paid - a.paid || b.registered - a.registered || a.name.localeCompare(b.name));
}

export function countLeaderboard(input: {
  agents: { id: string; name: string }[];
  registrations: StatRegistration[];
  paidEvents: StatPaidEvent[];
  range: LeaderRange;
  now: Date;
}): LeaderRow[] {
  const from = windowStart(input.range, input.now);
  const fromMs = from ? from.getTime() : null;

  const firstPaid = new Map<string, number>();
  for (const e of input.paidEvents) {
    const t = Date.parse(e.at);
    const prev = firstPaid.get(e.registrationId);
    if (prev === undefined || t < prev) firstPaid.set(e.registrationId, t);
  }

  const acc = new Map<string, { registered: number; paid: number; money: Map<string, number> }>();
  for (const a of input.agents) acc.set(a.id, { registered: 0, paid: 0, money: new Map() });

  for (const r of input.registrations) {
    if (!isSale(r) || !r.agentId) continue;
    const s = acc.get(r.agentId);
    if (!s) continue;
    const created = Date.parse(r.createdAt);
    if (fromMs === null || created >= fromMs) s.registered += 1;
    if (r.status !== "paid") continue;
    const paidAt = firstPaid.get(r.id) ?? created;
    if (fromMs !== null && paidAt < fromMs) continue;
    s.paid += 1;
    s.money.set(r.currency, (s.money.get(r.currency) ?? 0) + (r.amountReceived ?? r.expectedAmount));
  }

  return sortLeaders(
    input.agents.map((a) => {
      const s = acc.get(a.id)!;
      const revenue = Array.from(s.money)
        .map(([currency, amount]) => ({ currency, amount }))
        .sort((x, y) => x.currency.localeCompare(y.currency));
      return { agentId: a.id, name: a.name, registered: s.registered, paid: s.paid, revenue };
    }),
  );
}
