// src/lib/data/landing-agent-stats.ts
// Server-only numbers for the sales "My links" screen and the admin leaderboard.
// The counting is done in SQL (migration 0083) because the Supabase client returns at most 1000 rows
// per request; the same rules are written over plain rows in lib/landing/agent-stats-rules.ts.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sortLeaders, windowStart, type LeaderRange, type LeaderRow, type LinkStat } from "@/lib/landing/agent-stats-rules";

export type { LeaderRow, LinkStat };

/** Counts only (no revenue) for one agent, one entry per page the agent has any data for. */
export async function getAgentLinkStats(agentId: string): Promise<LinkStat[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("landing_agent_link_stats", { p_agent_id: agentId });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    pageId: r.page_id,
    views: Number(r.views),
    registered: Number(r.registered),
    paid: Number(r.paid),
  }));
}

function mapRevenue(raw: unknown): { currency: string; amount: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as { currency?: unknown; amount?: unknown };
    const amount = Number(o.amount);
    return typeof o.currency === "string" && Number.isFinite(amount) ? [{ currency: o.currency, amount }] : [];
  });
}

/** Every sales agent (zeros included), most paid first, then most registered. Admin screens only. */
export async function getLeaderboard(range: LeaderRange, now: Date = new Date()): Promise<LeaderRow[]> {
  const admin = createAdminSupabase();
  const from = windowStart(range, now);
  const { data, error } = await admin.rpc("landing_leaderboard", { p_from: from ? from.toISOString() : null });
  if (error) throw error;
  return sortLeaders(
    (data ?? []).map((r) => ({
      agentId: r.agent_id,
      name: r.name,
      registered: Number(r.registered),
      paid: Number(r.paid),
      revenue: mapRevenue(r.revenue),
    })),
  );
}

/** Main landing pages that are published (variants live in their own table). */
export async function listPublishedLinkPages(): Promise<{ id: string; slug: string; title: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .select("id, slug, title")
    .eq("status", "published")
    .order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, slug: p.slug, title: p.title }));
}
