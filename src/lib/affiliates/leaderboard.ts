// src/lib/affiliates/leaderboard.ts
// Pure ranking rules for the affiliate leaderboards. No server imports: everything works over plain rows.

import { TEAMS, type Team } from "@/lib/affiliates/service";

export type BoardPeriod = "all" | "month";
export type BoardRow = { affiliateId: string; name: string; team: Team | null; registered: number; paid: number };
export type RankedAffiliate = BoardRow & { rank: number; publicName: string };
export type TeamRank = { team: Team; rank: number; paid: number; members: number; active: number; score: number };
export type GapResult =
  | { kind: "first"; ahead: number; of: string | null }
  | { kind: "chase"; more: number; target: string; rank: number }
  | { kind: "none" };

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const TITLES = new Set(["dr", "prof", "mr", "mrs", "ms", "miss"]);
const MAX_SHARE_LINES = 10;

/** 00:00 on the 1st of the Pakistan-time month containing `now`, as a UTC instant. Pakistan has no daylight saving. */
export function monthStartPkt(now: Date): Date {
  const local = new Date(now.getTime() + PKT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - PKT_OFFSET_MS);
}

export function windowFor(period: BoardPeriod, now: Date): Date | null {
  return period === "month" ? monthStartPkt(now) : null;
}

/** "Ali Khan" -> "Ali K."; one word -> "Ali"; titles skipped; nothing usable -> "Affiliate". */
export function publicName(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[.,]/g, ""))
    .filter((w) => w.length > 0);
  const real = words.filter((w) => !TITLES.has(w.toLowerCase()));
  const use = real.length > 0 ? real : words;
  if (use.length === 0) return "Affiliate";
  if (use.length === 1) return use[0];
  return `${use[0]} ${Array.from(use[use.length - 1])[0].toUpperCase()}.`;
}

const sameStanding = (a: BoardRow, b: BoardRow) => a.paid === b.paid && a.registered === b.registered;

/** Paid desc, registered desc, name. Equal paid and registered share a rank (1,1,3). Nobody is dropped. */
export function rankAffiliates(rows: BoardRow[]): RankedAffiliate[] {
  const sorted = [...rows].sort((a, b) => b.paid - a.paid || b.registered - a.registered || a.name.localeCompare(b.name));
  const out: RankedAffiliate[] = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    const rank = prev && sameStanding(prev, r) ? prev.rank : i + 1;
    out.push({ ...r, rank, publicName: publicName(r.name) });
  });
  return out;
}

/** Team score = team paid / team active members (active = paid >= 1). All five teams are always returned. */
export function rankTeams(rows: BoardRow[]): TeamRank[] {
  const base = TEAMS.map((team) => {
    const members = rows.filter((r) => r.team === team);
    const paid = members.reduce((s, r) => s + r.paid, 0);
    const active = members.filter((r) => r.paid >= 1).length;
    return { team, paid, members: members.length, active, score: active > 0 ? paid / active : 0 };
  });
  // Array.sort is stable, so equal teams stay in the fixed Green, White, Yellow, Blue, Pink order.
  const sorted = [...base].sort((a, b) => b.score - a.score || b.paid - a.paid);
  const out: TeamRank[] = [];
  sorted.forEach((t, i) => {
    const prev = out[i - 1];
    const rank = prev && prev.score === t.score && prev.paid === t.paid ? prev.rank : i + 1;
    out.push({ ...t, rank });
  });
  return out;
}

export function gapFor(ranked: RankedAffiliate[], affiliateId: string): GapResult | null {
  const me = ranked.find((r) => r.affiliateId === affiliateId);
  if (!me) return null;
  if (me.paid === 0) return { kind: "none" };
  if (me.rank === 1) {
    const other = ranked.find((r) => r.affiliateId !== affiliateId);
    if (!other) return { kind: "first", ahead: 0, of: null };
    return { kind: "first", ahead: me.paid - other.paid, of: other.publicName };
  }
  let target: RankedAffiliate | undefined;
  for (const r of ranked) if (r.rank < me.rank) target = r;
  if (!target) return { kind: "none" };
  const more = target.paid > me.paid ? target.paid - me.paid : 1;
  return { kind: "chase", more, target: target.publicName, rank: target.rank };
}

export function gapLine(gap: GapResult): string {
  if (gap.kind === "none") return "Get your first paid sale to join the race.";
  if (gap.kind === "chase") return `${gap.more} more paid ${gap.more === 1 ? "sale" : "sales"} to pass ${gap.target}`;
  if (gap.of === null) return "You are first.";
  return gap.ahead === 0 ? `You are first, level with ${gap.of}` : `You are first, ${gap.ahead} ahead of ${gap.of}`;
}

/** Plain WhatsApp text for the top of a board. No money, no contact details. */
export function shareText(input: { period: BoardPeriod; top: RankedAffiliate[]; teams: TeamRank[]; boardUrl: string }): string {
  const title = input.period === "month" ? "This month" : "All time";
  const lines = [`Pharmacozyme Affiliates - ${title}`, ""];
  input.top.slice(0, MAX_SHARE_LINES).forEach((r) => {
    lines.push(`${r.rank}. ${r.publicName}${r.team ? ` (${r.team})` : ""} - ${r.paid} paid`);
  });
  const best = input.teams[0];
  if (best && best.score > 0) lines.push("", `Leading team: ${best.team}`);
  lines.push("", "Keep going, every paid sale counts!", input.boardUrl);
  return lines.join("\n");
}
