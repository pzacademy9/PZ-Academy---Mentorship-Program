import { requireAdminPage } from "@/lib/auth/require-admin";
import { getLeaderboard } from "@/lib/data/landing-agent-stats";
import { AgentLeaderboard, type Range } from "@/components/admin/landing/AgentLeaderboard";

export const metadata = { title: "Agent leaderboard — PZ Academy" };
export const dynamic = "force-dynamic";

function parseRange(raw: string | undefined): Range {
  return raw === "7d" || raw === "30d" ? raw : "all";
}

export default async function AgentLeaderboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdminPage();
  const range = parseRange((await searchParams).range);
  const rows = await getLeaderboard(range);
  return <AgentLeaderboard rows={rows} range={range} />;
}
