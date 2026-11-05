// Pure helpers for the public batch leaderboard and its share picture. No server imports.
// Only live students are ranked (rank !== null); recorded students never reach the podium or get a gap.
import type { PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";

export type RankedRow = PortalResultRow & { rank: number };

const isRanked = (r: PortalResultRow): r is RankedRow => r.mode === "live" && r.rank !== null;

/** The rows for the Overall switch or one class (by session id); unknown id = no rows. */
export function rowsFor(view: PortalBatchView, pick: string): PortalResultRow[] {
  return pick === "overall" ? view.overall : (view.perClass[pick] ?? []);
}

/** Live-ranked rows in board order (rank, then the builder's own order). */
function ranked(rows: PortalResultRow[]): RankedRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .filter((x): x is { r: RankedRow; i: number } => isRanked(x.r))
    .sort((a, b) => a.r.rank - b.r.rank || a.i - b.i)
    .map((x) => x.r);
}

/** Max score next to an overall total: only when every class that has results has a known max. */
function overallMax(view: PortalBatchView): number | null {
  const withResults = view.sessions.filter((s) => (view.perClass[s.id] ?? []).length > 0);
  if (withResults.length === 0 || withResults.some((s) => s.quizMax === null)) return null;
  return withResults.reduce((n, s) => n + (s.quizMax ?? 0), 0);
}

/** The "of max" for the Overall board or one class; null when it is not known. */
export function boardMax(view: PortalBatchView, pick: string): number | null {
  return pick === "overall" ? overallMax(view) : (view.sessions.find((s) => s.id === pick)?.quizMax ?? null);
}

/** Top three live-ranked rows. Tied rows keep their shared rank; fewer than three is fine. */
export function podium(rows: PortalResultRow[]): RankedRow[] {
  return ranked(rows).slice(0, 3);
}

/** Everyone not on the podium: ranks up to 10 first ("top"), then the other live rows and every recorded row ("more"). */
export function restRows(rows: PortalResultRow[]): { top: RankedRow[]; more: PortalResultRow[] } {
  const live = ranked(rows).slice(3);
  return {
    top: live.filter((r) => r.rank <= 10),
    more: [...live.filter((r) => r.rank > 10), ...rows.filter((r) => !isRanked(r))],
  };
}

/** Points needed to reach the nearest higher score, and who holds it. Null for rank 1, recorded or unknown students. */
export function gapAbove(rows: PortalResultRow[], pzId: string): { points: number; rank: number; name: string } | null {
  const board = ranked(rows);
  const me = board.find((r) => r.pzId === pzId);
  if (!me || me.rank === 1) return null;
  const above = board.filter((r) => r.score > me.score);
  if (above.length === 0) return null;
  const nearest = above.reduce((best, r) => (r.score < best.score ? r : best));
  return { points: nearest.score - me.score, rank: nearest.rank, name: nearest.name };
}

const TITLES = new Set(["dr", "prof", "mr", "mrs", "ms", "miss"]);
const LETTER = /[a-zÀ-￿]/i;

/** One or two capital letters: first and last word, skipping titles like "Dr." and punctuation. */
export function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zÀ-￿]/gi, ""))
    .filter((w) => w.length > 0 && LETTER.test(w));
  const real = words.filter((w) => !TITLES.has(w.toLowerCase()));
  const use = real.length > 0 ? real : words;
  if (use.length === 0) return "?";
  const first = use[0][0];
  const last = use.length > 1 ? use[use.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Cuts a long name at a word boundary and adds an ellipsis; the result is at most `max` characters. */
export function shortName(name: string, max: number): string {
  if (name.length <= max) return name;
  const cut = name.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trim()}…`;
}

/**
 * Only Basic Latin, Latin-1, Latin Extended A/B and Latin Extended Additional letters plus general
 * punctuation. The share picture has a Latin font only; anything else would be drawn scrambled or
 * make the renderer fetch a font from outside.
 */
export function isLatinText(s: string): boolean {
  return /^[ -~ -ɏḀ-ỿ‐-‧]*$/.test(s);
}

const IMAGE_NAME_MAX = 16;
const IMAGE_TITLE_MAX = { square: 40, story: 60 } as const;

/** Name and initials as drawn in the share picture: "Student #rank" when the name is not Latin. */
export function podiumImageEntry(e: { name: string; rank: number; score: number }): { name: string; initials: string; rank: number; score: number } {
  if (!isLatinText(e.name)) return { name: `Student #${e.rank}`, initials: `#${e.rank}`, rank: e.rank, score: e.score };
  return { name: shortName(e.name, IMAGE_NAME_MAX), initials: initials(e.name), rank: e.rank, score: e.score };
}

export function podiumImageTitle(title: string, size: PodiumSize): string {
  return isLatinText(title) ? shortName(title, IMAGE_TITLE_MAX[size]) : "Batch leaderboard";
}

export type PodiumSize = "square" | "story";
export const PODIUM_SIZES: Record<PodiumSize, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

/** Missing or blank = square; anything other than square/story = null (bad request). */
export function parsePodiumSize(v: string | null): PodiumSize | null {
  if (v === null || v === "") return "square";
  return v === "square" || v === "story" ? v : null;
}

/** Which board the picture shows: blank/"overall" = Overall, otherwise a session id or a class number. Null = no such class. */
export function resolvePodiumPick(view: PortalBatchView, cls: string | null): { id: string; label: string } | null {
  const v = (cls ?? "").trim();
  if (v === "" || v === "overall") return { id: "overall", label: "Overall" };
  const s = view.sessions.find((x) => x.id === v) ?? (/^\d+$/.test(v) ? view.sessions.find((x) => x.number === Number(v)) : undefined);
  return s ? { id: s.id, label: `Class ${s.number}` } : null;
}

export function podiumImageUrl(slug: string, size: PodiumSize, pick: string): string {
  const base = `/api/progress-podium/${encodeURIComponent(slug)}?size=${size}`;
  return pick === "overall" ? base : `${base}&class=${encodeURIComponent(pick)}`;
}

export function podiumFileName(slug: string, label: string, size: PodiumSize): string {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `pz-academy-${clean(slug).slice(0, 60)}-${clean(label)}-${size}.png`;
}
