// src/lib/data/affiliate-leaderboard.ts
// Server-only data for the affiliate leaderboards: the ranked board, the public-link token, and one affiliate's own rank.
import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { TEAMS, type Team } from "@/lib/affiliates/service";
import {
  gapFor,
  gapLine,
  rankAffiliates,
  rankTeams,
  windowFor,
  type BoardPeriod,
  type BoardRow,
  type RankedAffiliate,
  type TeamRank,
} from "@/lib/affiliates/leaderboard";

// Same shape as the private affiliate page token. Anything else never reaches the database.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export type AffiliateBoard = { period: BoardPeriod; rows: RankedAffiliate[]; teams: TeamRank[] };
export type OwnRank = { rank: number; of: number; paid: number; line: string; teamRank: number | null; team: Team | null };

const toTeam = (v: string | null): Team | null => ((TEAMS as readonly string[]).includes(v ?? "") ? (v as Team) : null);

export async function getAffiliateBoard(period: BoardPeriod, now: Date = new Date()): Promise<AffiliateBoard> {
  const admin = createAdminSupabase();
  const from = windowFor(period, now);
  // The function's argument is optional in the generated types; a missing window is sent as null (all time).
  const { data, error } = await admin.rpc("affiliate_leaderboard", { p_from: from ? from.toISOString() : null } as { p_from?: string });
  if (error) throw error;
  const rows: BoardRow[] = (data ?? []).map((r) => ({
    affiliateId: r.affiliate_id,
    name: r.name,
    team: toTeam(r.team),
    registered: Number(r.registered),
    paid: Number(r.paid),
  }));
  return { period, rows: rankAffiliates(rows), teams: rankTeams(rows) };
}

export async function getBoardToken(): Promise<string> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("affiliate_board_link").select("token").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The leaderboard link has not been set up.");
  return data.token;
}

export async function rotateBoardToken(): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const admin = createAdminSupabase();
  const { error } = await admin.from("affiliate_board_link").upsert({ id: true, token, rotated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
  return token;
}

/** False for a malformed token (no query is made) and for any token that is not the stored one. Compared in constant time. */
export async function isBoardToken(token: string): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const stored = Buffer.from(await getBoardToken());
  const given = Buffer.from(token);
  if (stored.length !== given.length) return false;
  return timingSafeEqual(stored, given);
}

function ownRank(board: AffiliateBoard, affiliateId: string): OwnRank | null {
  const me = board.rows.find((r) => r.affiliateId === affiliateId);
  // Nobody with no paid sale is ranked (matches the public board); "of" counts only those with a paid sale.
  if (!me || me.paid === 0) return null;
  const gap = gapFor(board.rows, affiliateId);
  return {
    rank: me.rank,
    of: board.rows.filter((r) => r.paid >= 1).length,
    paid: me.paid,
    line: gap ? gapLine(gap) : "",
    teamRank: me.team ? (board.teams.find((t) => t.team === me.team)?.rank ?? null) : null,
    team: me.team,
  };
}

/** One affiliate's own standing, for their private page. Carries no other affiliate's id or full name. */
export async function getAffiliateRank(affiliateId: string, now: Date = new Date()): Promise<{ all: OwnRank | null; month: OwnRank | null }> {
  const [all, month] = await Promise.all([getAffiliateBoard("all", now), getAffiliateBoard("month", now)]);
  return { all: ownRank(all, affiliateId), month: ownRank(month, affiliateId) };
}
