"use client";

// src/components/affiliates/YourRank.tsx
// The "Your rank" card on an affiliate's private page. Layout follows the Stitch screen "Your Affiliate Page - Mobile (390px)"
// (section rank-card). The reviewer-only "State:" buttons on that screen are not part of the product. The desktop screen had no
// card yet, so from md up the same card is laid out in three columns (rank, callout, team and board link).
import { useState, type ReactNode } from "react";
import type { AffiliatePageModel } from "@/lib/data/affiliate-page";
import { TEAMS } from "@/lib/affiliates/service";

type Period = "month" | "all";
type Rank = AffiliatePageModel["rank"];

const TEAM_DOT: Record<string, string> = {
  Green: "bg-green-500",
  White: "bg-slate-200 border border-landing-border",
  Yellow: "bg-yellow-400",
  Blue: "bg-sky-500",
  Pink: "bg-pink-400",
};

/** 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 11 -> 11th, 21 -> 21st. */
export function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

// Accent colours: the landing tokens have no gold, so the rank pill uses Tailwind amber (accepted for this accent).
const AMBER_TEXT = "text-amber-600";

function Icon({ children, className = "h-4 w-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {children}
    </svg>
  );
}

const MEDAL = <path d="M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3 1.2-6.5L2.5 8.9 9.1 8z" />;
const CROWN = <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />;
const ARROW_UP = <path d="M12 19V5M5 12l7-7 7 7" />;
const ROCKET = <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-7 7-5-5zM9 15l-3-3 3-1" />;
const LIST = <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />;
const ARROW_RIGHT = <path d="M5 12h14M12 5l7 7-7 7" />;
const BOARD = <path d="M3 21h18M6 21V11h4v10M10 21V4h4v17M14 21v-7h4v7" />;

const TABS: { id: Period; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

export function YourRank({ rank }: { rank: Rank }) {
  const [period, setPeriod] = useState<Period>("month");
  // No ranks and no board link means the rank could not be loaded: the card stays away rather than saying "Unranked" wrongly.
  if (!rank.all && !rank.month && !rank.boardUrl) return null;

  const own = rank[period];
  const first = own?.rank === 1;
  const team = own?.team ?? null;

  return (
    <section data-testid="your-rank" className="rounded-2xl border border-landing-border bg-white p-4 shadow-landing-soft md:p-6">
      <div className="grid gap-3.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:gap-6">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-landing-border pb-2">
            <div className="flex items-center gap-1.5">
              <Icon className={`h-5 w-5 ${AMBER_TEXT}`}>{BOARD}</Icon>
              <h2 className="font-headline text-base font-bold text-landing-deep md:text-xl">Your rank</h2>
            </div>
            <div role="tablist" aria-label="Rank period" className="inline-flex items-center rounded-full bg-landing-surface p-0.5 text-[11px] font-semibold">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={period === t.id}
                  onClick={() => setPeriod(t.id)}
                  className={`min-h-[32px] rounded-full px-3 py-1 transition-colors ${period === t.id ? "bg-landing-deep text-white shadow-sm" : "text-landing-muted"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {own ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className={`inline-flex items-center gap-1.5 rounded-2xl border border-amber-300 px-3 py-1 ${first ? "bg-amber-100" : "bg-amber-50"}`}>
                {first && <Icon className={`h-5 w-5 ${AMBER_TEXT}`}>{CROWN}</Icon>}
                <span className={`font-headline text-3xl font-black tracking-tight ${AMBER_TEXT}`}>{ordinal(own.rank)}</span>
                {!first && <Icon className={`h-5 w-5 ${AMBER_TEXT}`}>{MEDAL}</Icon>}
              </div>
              <span className="text-sm font-medium text-landing-muted">{`You are ${ordinal(own.rank)} of ${own.of} affiliates`}</span>
            </div>
          ) : (
            <div className="inline-flex w-fit items-center rounded-2xl border border-landing-border bg-landing-surface px-3 py-1">
              <span className="font-headline text-2xl font-bold tracking-tight text-landing-muted">Unranked</span>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center">
          {own ? (
            own.line && (
              <p
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold leading-tight md:text-sm ${
                  first ? "border-amber-200 bg-amber-50 text-landing-deep" : "border-emerald-100 bg-emerald-50 text-emerald-800"
                }`}
              >
                <Icon className={first ? `${AMBER_TEXT}` : "text-emerald-700"}>{first ? MEDAL : ARROW_UP}</Icon>
                <span>{own.line}</span>
              </p>
            )
          ) : (
            <p className="flex items-center gap-2 rounded-xl border border-landing-border bg-landing-surface px-3 py-2.5 text-xs font-semibold leading-tight text-landing-deep md:text-sm">
              <Icon className="text-landing-primary">{ROCKET}</Icon>
              <span>Get your first paid sale to join the race.</span>
            </p>
          )}
        </div>

        <div className="flex flex-col justify-center gap-3.5">
          {own && team && own.teamRank !== null && (
            <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-landing-muted md:text-sm">
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${TEAM_DOT[team] ?? "bg-slate-300"}`} />
              <span>
                Your team <span className="font-semibold text-landing-deep">{team}</span>
                {` is ${ordinal(own.teamRank)} of ${TEAMS.length}.`}
              </span>
            </p>
          )}
          {rank.boardUrl && (
            <a
              href={rank.boardUrl}
              className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full border border-landing-border bg-landing-surface px-4 py-2.5 font-headline text-xs font-bold text-landing-deep"
            >
              <Icon className="h-4 w-4 text-landing-primary">{LIST}</Icon>
              <span>See the full board</span>
              <Icon className="h-4 w-4 text-landing-muted">{ARROW_RIGHT}</Icon>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
