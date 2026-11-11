// src/lib/affiliates/board-view.ts
// What the public leaderboard is allowed to show. The server projects every row down to these fields before the
// client component sees anything, so an id, a full name, an email or a code can never reach the browser.
import type { Team } from "@/lib/affiliates/service";
import type { RankedAffiliate, TeamRank } from "@/lib/affiliates/leaderboard";

export type BoardViewRow = { rank: number; publicName: string; team: Team | null; paid: number };
export type BoardViewTeam = { team: Team; rank: number; paid: number; active: number; score: number };
export type BoardView = { rows: BoardViewRow[]; teams: BoardViewTeam[] };
export type BoardViews = { all: BoardView; month: BoardView };

export function toBoardView(board: { rows: RankedAffiliate[]; teams: TeamRank[] }): BoardView {
  return {
    // Only affiliates with a paid sale are on the public board; ranks stay the real ranks. The team race keeps every row.
    rows: board.rows.filter((r) => r.paid >= 1).map((r) => ({ rank: r.rank, publicName: r.publicName, team: r.team, paid: r.paid })),
    teams: board.teams.map((t) => ({ team: t.team, rank: t.rank, paid: t.paid, active: t.active, score: t.score })),
  };
}
