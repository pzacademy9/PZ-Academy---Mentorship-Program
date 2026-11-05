"use client";

import { useState } from "react";
import { Crown, Medal, Sparkles, Trophy } from "lucide-react";
import { boardMax, initials, podium, resolvePodiumPick, restRows, gapAbove } from "@/lib/progress/leaderboard";
import type { PortalAttendanceRow, PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";
import { btnFocus } from "../ui";
import { SharePodium } from "./SharePodium";

export const fmtPoints = (n: number) => n.toLocaleString("en-US");
const ordinal = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? `${n}st` : n % 10 === 2 && n % 100 !== 12 ? `${n}nd` : n % 10 === 3 && n % 100 !== 13 ? `${n}rd` : `${n}th`);

/** Overall / Class N switch, shared by the Leaderboard and Find me tabs. Scrolls sideways without a visible bar. */
export function BoardPicker({ view, pick, onPick }: { view: PortalBatchView; pick: string; onPick: (id: string) => void }) {
  const options = [{ id: "overall", label: "Overall" }, ...view.sessions.map((s) => ({ id: s.id, label: `Class ${s.number}` }))];
  return (
    <div className="relative min-w-0">
      <div
        role="group"
        aria-label="Show results for"
        className="flex min-w-0 gap-2 overflow-x-auto py-1 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={pick === o.id}
            onClick={() => onPick(o.id)}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-5 font-montserrat text-sm font-bold transition-colors motion-reduce:transition-none ${btnFocus} ${
              pick === o.id
                ? "bg-pz-solid-deep text-white shadow-md"
                : "bg-pz-surface-container-lowest text-pz-deep ring-1 ring-pz-outline-variant/40 hover:bg-pz-web-surface-low"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {/* Soft fade on the right edge hints that more classes scroll in. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-pz-web-surface to-transparent" />
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

type Tone = "gold" | "silver" | "bronze" | "plain" | "found" | "muted";

function Avatar({ name, tone, size = "md" }: { name: string; tone: Tone; size?: "md" | "lg" | "xl" }) {
  const tones: Record<Tone, string> = {
    gold: "bg-gradient-to-br from-pz-secondary-container to-pz-gold text-pz-on-secondary-container ring-4 ring-pz-secondary-container/60",
    silver: "bg-gradient-to-br from-pz-surface-container-lowest to-pz-surface-container-highest text-pz-on-surface ring-4 ring-pz-surface-container-highest",
    bronze: "bg-gradient-to-br from-pz-secondary-fixed to-pz-secondary-fixed-dim text-pz-on-secondary-fixed ring-4 ring-pz-secondary-fixed",
    plain: "bg-pz-web-surface-high text-pz-deep",
    found: "bg-pz-solid-deep text-pz-bright",
    muted: "bg-pz-surface-container-high text-pz-on-surface-variant",
  };
  const sizes = { md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base sm:h-[4.5rem] sm:w-[4.5rem] sm:text-xl", xl: "h-[4.5rem] w-[4.5rem] text-xl sm:h-24 sm:w-24 sm:text-2xl" } as const;
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full font-montserrat font-black shadow-md ${tones[tone]} ${sizes[size]}`}>
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
      className={`flex min-w-0 items-center gap-3 rounded-[20px] p-3.5 sm:gap-4 sm:px-5 ${
        highlight
          ? "bg-pz-primary-container/40 ring-2 ring-pz-bright"
          : "bg-pz-surface-container-lowest shadow-[0_4px_16px_rgba(15,61,34,0.05)] ring-1 ring-pz-outline-variant/30"
      }`}
    >
      {row.rank !== null ? (
        <span
          className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 font-montserrat text-base font-black ${
            highlight ? "bg-pz-solid-deep text-pz-bright" : "text-pz-muted"
          }`}
        >
          <span className="sr-only">Rank </span>
          {row.rank}
        </span>
      ) : (
        <span aria-hidden className="w-8 shrink-0" />
      )}
      <span className="max-[359px]:hidden">
        <Avatar name={row.name} tone={highlight ? "found" : recorded ? "muted" : "plain"} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 break-words font-montserrat text-sm font-bold leading-snug text-pz-deep sm:text-base">{row.name}</span>
          {recorded && (
            <span className="rounded-full bg-pz-surface-container-high px-2 py-0.5 font-poppins text-xs font-bold text-pz-on-surface-variant">Recorded</span>
          )}
          {highlight && <span className="rounded-full bg-pz-bright px-2 py-0.5 font-poppins text-xs font-bold text-pz-solid-deep">Found</span>}
        </div>
        <span className="w-fit rounded-md bg-pz-web-surface-low px-1.5 py-0.5 font-mono text-xs text-pz-muted">{row.pzId}</span>
        {attended && <span className="font-poppins text-xs text-pz-muted">{attended}</span>}
        {note && <span className={`font-poppins text-xs font-bold ${noteMuted ? "text-pz-muted" : "text-pz-mid"}`}>{note}</span>}
      </div>
      <div className="flex shrink-0 flex-col items-end text-right">
        {row.score === null ? (
          <span className="font-poppins text-xs text-pz-muted">No score yet</span>
        ) : (
          <>
            <span className={`font-montserrat text-lg font-black leading-tight tracking-tight sm:text-xl ${highlight ? "text-pz-mid" : "text-pz-deep"}`}>
              <span>{fmtPoints(row.score)}</span>
            </span>
            <span className="font-poppins text-[11px] font-semibold text-pz-muted sm:text-xs">{max !== null ? `of ${fmtPoints(max)} pts` : "points"}</span>
          </>
        )}
      </div>
    </li>
  );
}

const PLACE_ORDER = ["order-2", "order-1", "order-3"] as const;

function Podium({ view, pick, rows, highlight, max }: { view: PortalBatchView; pick: string; rows: PortalResultRow[]; highlight: string | null; max: number | null }) {
  const top = podium(rows);
  const label = resolvePodiumPick(view, pick)?.label ?? "Overall";
  return (
    <div className="relative min-w-0 rounded-[28px] bg-pz-surface-container-lowest shadow-[0_12px_40px_rgba(15,61,34,0.10)] ring-1 ring-pz-outline-variant/30">
      {/* Decoration is clipped on its own layer, so the share menu can hang outside the card. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-pz-primary-container/30 to-transparent" />
        <div className="absolute left-1/2 top-16 h-56 w-56 -translate-x-1/2 rounded-full bg-pz-secondary-container/40 blur-3xl" />
        <Sparkles className="absolute left-[12%] top-20 h-5 w-5 text-pz-gold/60" />
        <Sparkles className="absolute right-[14%] top-28 h-4 w-4 text-pz-gold/50" />
      </div>
      <div className="relative flex min-w-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-8 sm:pt-7">
        <p className="flex items-center gap-2 font-poppins text-xs font-bold uppercase tracking-wider text-pz-secondary sm:text-sm">
          <Trophy aria-hidden className="h-4 w-4" />
          Batch honorees
          <span className="font-semibold normal-case tracking-normal text-pz-muted">· {label}</span>
        </p>
        {top.length > 0 && <SharePodium slug={view.slug} title={view.title} pick={pick} label={label} />}
      </div>
      {top.length === 0 ? (
        <p className="relative m-5 rounded-2xl bg-pz-web-surface-low p-4 font-poppins text-base text-pz-muted sm:m-8">No ranked students yet</p>
      ) : (
        <ol aria-label="Podium" className="relative mx-auto mt-6 flex min-w-0 max-w-2xl items-end justify-center gap-2.5 px-3 sm:mt-8 sm:gap-6 sm:px-8">
          {top.map((r, i) => {
            const first = r.rank === 1;
            const tone = first ? "gold" : r.rank === 2 ? "silver" : "bronze";
            const found = highlight === r.pzId;
            return (
              <li
                key={r.pzId}
                aria-current={found ? "true" : undefined}
                className={`${PLACE_ORDER[i]} flex min-w-0 max-w-52 flex-1 basis-0 flex-col items-center motion-safe:duration-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4`}
              >
                {first ? (
                  <Crown data-podium-crown aria-hidden className="mb-1.5 h-8 w-8 fill-pz-secondary-container text-pz-gold drop-shadow sm:h-10 sm:w-10" />
                ) : (
                  <Medal data-podium-medal aria-hidden className={`mb-1.5 h-6 w-6 sm:h-7 sm:w-7 ${r.rank === 2 ? "text-pz-outline" : "text-pz-secondary"}`} />
                )}
                <span className="relative flex flex-col items-center">
                  <Avatar name={r.name} tone={found ? "found" : tone} size={first ? "xl" : "lg"} />
                  <span
                    className={`absolute -bottom-2.5 rounded-full px-2.5 py-0.5 font-montserrat text-xs font-black shadow-sm ${
                      first ? "bg-pz-gold text-white" : r.rank === 2 ? "bg-pz-surface-container-highest text-pz-on-surface" : "bg-pz-secondary text-pz-on-secondary"
                    }`}
                  >
                    <span aria-hidden>#</span>
                    <span className="sr-only">Rank </span>
                    {r.rank}
                  </span>
                </span>
                <span className="mt-4 line-clamp-2 w-full break-words text-center font-montserrat text-xs font-bold leading-snug text-pz-deep sm:text-sm">{r.name}</span>
                <span className={`mt-1 font-montserrat font-black leading-none tracking-tight ${first ? "text-lg text-pz-mid sm:text-2xl" : "text-base text-pz-deep sm:text-xl"}`}>
                  {fmtPoints(r.score)}
                  <span className="ml-0.5 font-poppins text-[11px] font-semibold text-pz-muted">pts</span>
                </span>
                {max !== null && <span className="mt-0.5 font-poppins text-[11px] text-pz-muted sm:text-xs">of {fmtPoints(max)}</span>}
                <span
                  aria-hidden
                  className={`mt-3 flex w-full items-start justify-center rounded-t-2xl pt-3 font-montserrat text-sm font-black sm:text-base ${
                    first
                      ? "h-28 bg-gradient-to-b from-pz-bright to-pz-primary-container text-pz-solid-deep shadow-[0_-8px_24px_rgba(126,217,87,0.35)] sm:h-36"
                      : r.rank === 2
                        ? "h-20 bg-gradient-to-b from-pz-surface-container-high to-pz-surface-container text-pz-on-surface-variant sm:h-24"
                        : "h-14 bg-gradient-to-b from-pz-secondary-fixed to-pz-secondary-fixed/50 text-pz-on-secondary-fixed sm:h-[4.5rem]"
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
    <div className="flex min-w-0 flex-col gap-5">
      <BoardPicker view={view} pick={pick} onPick={onPick} />
      {rows.length === 0 ? (
        <p className="rounded-[20px] bg-pz-surface-container-lowest p-5 font-poppins text-base text-pz-muted">No results yet</p>
      ) : (
        <>
          <Podium view={view} pick={pick} rows={rows} highlight={highlight} max={max} />
          {top.length > 0 && (
            <section aria-labelledby="board-top" className="flex min-w-0 flex-col gap-2.5">
              <h2 id="board-top" className="px-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">
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
                <h2 id="board-more" className="px-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">
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
                className={`mx-auto min-h-11 rounded-full bg-pz-surface-container-lowest px-6 font-montserrat text-sm font-bold text-pz-deep shadow-sm ring-1 ring-pz-outline-variant/40 transition-colors hover:bg-pz-web-surface-low motion-reduce:transition-none ${btnFocus}`}
              >
                Show {more.length} more
              </button>
            ))}
        </>
      )}
    </div>
  );
}
