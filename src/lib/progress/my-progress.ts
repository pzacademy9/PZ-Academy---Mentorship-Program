// Pure helpers for the "My Progress" view (one student, one batch at a time). No server imports.
// Every number shown comes from real data: the student's own marks and scores, and the public batch board.
import type { ProgressBatch } from "@/lib/progress/build";
import type { PortalBatchView } from "@/lib/progress/portal-build";
import { boardMax, gapAbove } from "@/lib/progress/leaderboard";

/** Where the student stands on the batch's Overall board. rank is null for recorded or unscored students. */
export type Standing = {
  rank: number | null;
  /** How many live students are ranked on the Overall board. */
  of: number;
  /** Points to reach the nearest higher score, and that score's rank. */
  gap: { points: number; rank: number } | null;
  /** The Overall board's max total, when every class with results has a known max. */
  max: number | null;
};

export function standingFor(view: PortalBatchView, pzId: string): Standing {
  const ranked = view.overall.filter((r) => r.mode === "live" && r.rank !== null);
  const me = ranked.find((r) => r.pzId === pzId);
  const gap = me ? gapAbove(view.overall, pzId) : null;
  return {
    rank: me?.rank ?? null,
    of: ranked.length,
    gap: gap ? { points: gap.points, rank: gap.rank } : null,
    max: boardMax(view, "overall"),
  };
}

export const fmtNumber = (n: number) => n.toLocaleString("en-US");

/** The motivating line, only when it can be worked out from the real board. */
export function gapText(s: Standing | null): string | null {
  if (!s || s.rank === null) return null;
  if (s.rank === 1) return "You are #1 in this batch";
  if (!s.gap) return null;
  return `${fmtNumber(s.gap.points)} more ${s.gap.points === 1 ? "point" : "points"} to reach #${s.gap.rank}`;
}

export type Badge = { id: "perfect-attendance" | "top-3"; label: string; detail: string };

/** Only badges backed by real data: every held class attended, and a live Overall rank of 1 to 3. */
export function badgesFor(batch: ProgressBatch, standing: Standing | null): Badge[] {
  const out: Badge[] = [];
  const a = batch.attendance;
  if (batch.mode === "live" && a && a.held > 0 && a.attended === a.held) {
    out.push({ id: "perfect-attendance", label: "Perfect attendance", detail: `Attended all ${a.held} ${a.held === 1 ? "class" : "classes"} held` });
  }
  if (batch.mode === "live" && standing && standing.rank !== null && standing.rank <= 3) {
    out.push({ id: "top-3", label: "Top 3", detail: `Rank ${standing.rank} of ${standing.of} in this batch` });
  }
  return out;
}

/** Ring values: percent attended and the filled share of the circle (0 to 1). Null when nothing was held. */
export function attendanceRing(a: ProgressBatch["attendance"]): { pct: number; dash: number } | null {
  if (!a || a.held === 0 || a.pct === null) return null;
  const pct = Math.min(100, Math.max(0, a.pct));
  return { pct, dash: pct / 100 };
}

export type LedgerRow = {
  number: number;
  title: string;
  startsAt: string;
  /** null = attendance not tracked (recorded students). */
  state: "present" | "absent" | "upcoming" | null;
  how: "check-in" | "admin" | null;
  score: number | null;
  max: number | null;
  rank: number | null;
  of: number | null;
};

/** One row per class: the student's attendance merged with their points for that class. */
export function ledgerRows(batch: ProgressBatch): LedgerRow[] {
  const byNumber = new Map<number, LedgerRow>();
  for (const r of batch.attendance?.rows ?? []) {
    byNumber.set(r.number, { number: r.number, title: r.title, startsAt: r.startsAt, state: r.state, how: r.how, score: null, max: null, rank: null, of: null });
  }
  for (const r of batch.results.rows) {
    const base = byNumber.get(r.number) ?? { number: r.number, title: r.title, startsAt: r.startsAt, state: null, how: null, score: null, max: null, rank: null, of: null };
    byNumber.set(r.number, { ...base, score: r.score, max: r.max, rank: r.rank, of: r.of });
  }
  return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
}

/** Number of the earliest upcoming class, or null. */
export function nextClassNumber(rows: LedgerRow[]): number | null {
  const upcoming = rows.filter((r) => r.state === "upcoming").sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.number - b.number);
  return upcoming[0]?.number ?? null;
}

/** "of max" for the student's total: the board's max, else the sum of their own classes' maxes when all are known. */
export function scoreMax(batch: ProgressBatch, standing: Standing | null): number | null {
  if (standing?.max != null) return standing.max;
  const rows = batch.results.rows;
  if (rows.length === 0 || rows.some((r) => r.max === null)) return null;
  return rows.reduce((n, r) => n + (r.max ?? 0), 0);
}

/** WhatsApp share link with the public batch page only: no ID, score or other private detail. */
export function shareProgressHref(batchTitle: string, origin: string, slug: string): string {
  const url = `${origin.replace(/\/+$/, "")}/progress/${encodeURIComponent(slug)}`;
  const text = `I am tracking my progress in ${batchTitle} at PZ Academy. See the batch leaderboard: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
