"use client";

import { useState } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { initials, podium, restRows, gapAbove } from "@/lib/progress/leaderboard";
import type { PortalAttendanceRow, PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";
import { btnFocus } from "../ui";

export const fmtPoints = (n: number) => n.toLocaleString("en-US");
const ordinal = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? `${n}st` : n % 10 === 2 && n % 100 !== 12 ? `${n}nd` : n % 10 === 3 && n % 100 !== 13 ? `${n}rd` : `${n}th`);

/** Max score next to an overall total: only when every class that has results has a known max. */
function overallMax(view: PortalBatchView): number | null {
  const withResults = view.sessions.filter((s) => (view.perClass[s.id] ?? []).length > 0);
  if (withResults.length === 0 || withResults.some((s) => s.quizMax === null)) return null;
  return withResults.reduce((n, s) => n + (s.quizMax ?? 0), 0);
}

export function boardMax(view: PortalBatchView, pick: string): number | null {
  return pick === "overall" ? overallMax(view) : (view.sessions.find((s) => s.id === pick)?.quizMax ?? null);
}

/** Overall / Class N switch, shared by the Leaderboard and Find me tabs. */
export function BoardPicker({ view, pick, onPick }: { view: PortalBatchView; pick: string; onPick: (id: string) => void }) {
  const options = [{ id: "overall", label: "Overall" }, ...view.sessions.map((s) => ({ id: s.id, label: `Class ${s.number}` }))];
  return (
    <div role="group" aria-label="Show results for" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={pick === o.id}
          onClick={() => onPick(o.id)}
          className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 font-headline text-sm font-bold transition-colors motion-reduce:transition-none ${btnFocus} ${
            pick === o.id ? "bg-pz-primary text-pz-on-primary shadow-sm" : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "x/y classes attended" only from real attendance: live students with at least one held class. */
export function attendedLine(att: PortalAttendanceRow | undefined): string | null {
  if (!att || att.mode !== "live" || att.attended === null || !att.held) return null;
  return `${att.attended}/${att.held} classes attended`;
}

export function gapLine(rows: PortalResultRow[], pzId: string): string | null {
  const gap = gapAbove(rows, pzId);
  if (!gap) return null;
  return `${fmtPoints(gap.points)} ${gap.points === 1 ? "point" : "points"} behind ${gap.name} (rank ${gap.rank})`;
}

function Avatar({ name, tone, size = "md" }: { name: string; tone: "gold" | "silver" | "bronze" | "plain" | "found" | "muted"; size?: "md" | "lg" | "xl" }) {
  const tones = {
    gold: "bg-pz-secondary-container text-pz-on-secondary-container",
    silver: "bg-pz-surface-container-highest text-pz-on-surface",
    bronze: "bg-pz-secondary-fixed text-pz-on-secondary-fixed",
    plain: "bg-pz-surface-container-high text-pz-on-surface",
    found: "bg-pz-primary text-pz-on-primary",
    muted: "bg-pz-surface-container-highest text-pz-on-surface-variant",
  } as const;
  const sizes = { md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base sm:h-16 sm:w-16 sm:text-lg", xl: "h-16 w-16 text-lg sm:h-20 sm:w-20 sm:text-xl" } as const;
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full font-headline font-black shadow-sm ${tones[tone]} ${sizes[size]}`}>
      {initials(name)}
    </span>
  );
}

export function RankRow({
  row,
  max,
  att,
  highlight,
  note,
  noteMuted = false,
}: {
  row: { name: string; pzId: string; mode: "live" | "recorded"; score: number | null; rank: number | null };
  max: number | null;
  att: PortalAttendanceRow | undefined;
  highlight: boolean;
  /** Extra line under the PZ ID, e.g. the gap to the student above. */
  note?: string | null;
  noteMuted?: boolean;
}) {
  const recorded = row.mode === "recorded";
  const attended = attendedLine(att);
  return (
    <li
      aria-current={highlight ? "true" : undefined}
      className={`flex min-w-0 items-center gap-3 rounded-xl p-3 shadow-sm ring-1 sm:gap-4 sm:px-4 ${
        highlight ? "bg-pz-primary-fixed/40 ring-pz-primary" : "bg-pz-surface-container-lowest ring-pz-outline-variant/40"
      }`}
    >
      {row.rank !== null ? (
        <span
          className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 font-headline text-sm font-black ${
            highlight ? "bg-pz-primary text-pz-on-primary" : "text-pz-on-surface-variant"
          }`}
        >
          <span className="sr-only">Rank </span>
          {row.rank}
        </span>
      ) : (
        <span aria-hidden className="w-8 shrink-0" />
      )}
      <Avatar name={row.name} tone={highlight ? "found" : recorded ? "muted" : "plain"} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-headline text-sm font-bold text-pz-on-surface sm:text-base">{row.name}</span>
          {recorded && (
            <span className="rounded-full bg-pz-surface-container-high px-2 py-0.5 font-headline text-xs font-bold text-pz-on-surface-variant">Recorded</span>
          )}
          {highlight && <span className="rounded bg-pz-primary px-1.5 py-0.5 font-headline text-xs font-bold text-pz-on-primary">Found</span>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-pz-on-surface-variant">
          <span className="rounded bg-pz-surface-container px-1.5 py-0.5 font-mono">{row.pzId}</span>
          {attended && <span>{attended}</span>}
        </div>
        {note && <span className={`text-xs font-bold ${noteMuted ? "text-pz-on-surface-variant" : "text-pz-primary"}`}>{note}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-end text-right">
        {row.score === null ? (
          <span className="text-xs text-pz-on-surface-variant">No score yet</span>
        ) : (
          <>
            <span className={`font-headline text-base font-black sm:text-lg ${highlight ? "text-pz-primary" : "text-pz-on-surface"}`}>
              <span>{fmtPoints(row.score)}</span>
              {max !== null && <span className="text-xs font-semibold text-pz-on-surface-variant"> of {fmtPoints(max)}</span>}
            </span>
            <span className="text-xs text-pz-on-surface-variant">points</span>
          </>
        )}
      </div>
    </li>
  );
}

const PLACE_ORDER = ["order-2", "order-1", "order-3"] as const;

function Podium({ rows, highlight, max }: { rows: PortalResultRow[]; highlight: string | null; max: number | null }) {
  const top = podium(rows);
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl bg-pz-surface-container-lowest p-4 shadow-sm ring-1 ring-pz-outline-variant/40 sm:p-8">
      <p className="mb-4 flex items-center gap-1.5 font-headline text-xs font-bold uppercase tracking-wider text-pz-secondary sm:justify-center sm:text-sm">
        <Trophy aria-hidden className="h-4 w-4" />
        Batch honorees
      </p>
      {top.length === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No ranked students yet</p>
      ) : (
        <ol aria-label="Podium" className="mx-auto flex min-w-0 max-w-2xl items-end justify-center gap-2 sm:gap-6">
          {top.map((r, i) => {
            const first = r.rank === 1;
            const tone = first ? "gold" : r.rank === 2 ? "silver" : "bronze";
            const found = highlight === r.pzId;
            return (
              <li
                key={r.pzId}
                aria-current={found ? "true" : undefined}
                className={`${PLACE_ORDER[i]} flex min-w-0 max-w-48 flex-1 basis-0 flex-col items-center ${first ? "" : "pt-4"}`}
              >
                {first ? (
                  <Crown data-podium-crown aria-hidden className="mb-1 h-7 w-7 fill-pz-secondary-container text-pz-secondary sm:h-8 sm:w-8" />
                ) : (
                  <Medal data-podium-medal aria-hidden className={`mb-1 h-6 w-6 ${r.rank === 2 ? "text-pz-outline" : "text-pz-secondary"}`} />
                )}
                <span className="relative flex flex-col items-center">
                  <Avatar name={r.name} tone={found ? "found" : tone} size={first ? "xl" : "lg"} />
                  <span
                    className={`absolute -bottom-2 rounded-full px-2 font-headline text-xs font-black ${
                      first ? "bg-pz-secondary text-pz-on-secondary" : "bg-pz-surface-variant text-pz-on-surface"
                    }`}
                  >
                    <span aria-hidden>#</span>
                    <span className="sr-only">Rank </span>
                    {r.rank}
                  </span>
                </span>
                <span className="mt-3 line-clamp-2 w-full break-words text-center font-headline text-xs font-bold text-pz-on-surface sm:text-sm">{r.name}</span>
                <span
                  className={`mt-0.5 rounded-md px-1.5 py-0.5 font-headline text-xs font-black sm:text-sm ${
                    first ? "bg-pz-primary-fixed/40 text-pz-primary" : "text-pz-secondary"
                  }`}
                >
                  {fmtPoints(r.score)} pts
                </span>
                {max !== null && <span className="text-xs text-pz-on-surface-variant">of {fmtPoints(max)}</span>}
                <span
                  aria-hidden
                  className={`mt-2 flex w-full items-center justify-center rounded-t-xl font-headline text-xs font-bold sm:text-sm ${
                    first
                      ? "h-24 bg-pz-primary-fixed text-pz-on-primary-fixed sm:h-32"
                      : r.rank === 2
                        ? "h-16 bg-pz-surface-container-high text-pz-on-surface-variant sm:h-24"
                        : "h-12 bg-pz-surface-container text-pz-on-surface-variant sm:h-16"
                  }`}
                >
                  {ordinal(r.rank)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

interface Props {
  view: PortalBatchView;
  pick: string;
  onPick: (id: string) => void;
  rows: PortalResultRow[];
  /** PZ ID of the one student the Find me search matched, if exactly one. */
  highlight: string | null;
}

export function Leaderboard({ view, pick, onPick, rows, highlight }: Props) {
  const [showMore, setShowMore] = useState(false);
  const max = boardMax(view, pick);
  const { top, more } = restRows(rows);
  const attBy = new Map(view.attendance.map((a) => [a.pzId, a]));
  const moreOpen = showMore || top.length === 0 || (highlight !== null && more.some((r) => r.pzId === highlight));
  const topLabel = top.length === 0 ? "" : top[0].rank === top[top.length - 1].rank ? `Rank ${top[0].rank}` : `Ranks ${top[0].rank} to ${top[top.length - 1].rank}`;

  const list = (items: PortalResultRow[]) =>
    items.map((r) => <RankRow key={r.pzId} row={r} max={max} att={attBy.get(r.pzId)} highlight={highlight === r.pzId} />);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BoardPicker view={view} pick={pick} onPick={onPick} />
      {rows.length === 0 ? (
        <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No results yet</p>
      ) : (
        <>
          <Podium rows={rows} highlight={highlight} max={max} />
          {top.length > 0 && (
            <section aria-labelledby="board-top" className="flex min-w-0 flex-col gap-2.5">
              <h2 id="board-top" className="px-1 font-headline text-xs font-bold uppercase tracking-wider text-pz-on-surface-variant">
                {topLabel}
              </h2>
              <ol aria-label={topLabel} className="flex min-w-0 flex-col gap-2.5">
                {list(top)}
              </ol>
            </section>
          )}
          {more.length > 0 &&
            (moreOpen ? (
              <section aria-labelledby="board-more" className="flex min-w-0 flex-col gap-2.5">
                <h2 id="board-more" className="px-1 font-headline text-xs font-bold uppercase tracking-wider text-pz-on-surface-variant">
                  Everyone else
                </h2>
                <ul aria-label="Everyone else" className="flex min-w-0 flex-col gap-2.5">
                  {list(more)}
                </ul>
              </section>
            ) : (
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className={`mx-auto min-h-11 rounded-full bg-pz-surface-container-high px-5 font-headline text-sm font-bold text-pz-on-surface-variant transition-colors hover:bg-pz-surface-variant motion-reduce:transition-none ${btnFocus}`}
              >
                Show {more.length} more
              </button>
            ))}
        </>
      )}
    </div>
  );
}
