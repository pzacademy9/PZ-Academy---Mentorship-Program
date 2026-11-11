"use client";

// src/components/affiliates/AffiliateBoard.tsx
// The public affiliate leaderboard: period switch, podium of three, ranked list, a "more" section and the team race.
// Structure follows the student progress portal leaderboard. It only ever receives the projected rows from
// "@/lib/affiliates/board-view": rank, first name + last initial, team and paid count. No money, no contact details.
import { useState } from "react";
import { Crown, Medal, Sparkles, Trophy } from "lucide-react";
import type { BoardView, BoardViewRow, BoardViews } from "@/lib/affiliates/board-view";

type Period = "month" | "all";

const TEAM_DOT: Record<string, string> = {
  Green: "bg-green-500",
  White: "bg-slate-200 border border-landing-border",
  Yellow: "bg-yellow-400",
  Blue: "bg-sky-500",
  Pink: "bg-pink-400",
};

const SHOWN_FIRST = 10;
const PLACE_ORDER = ["order-2", "order-1", "order-3"] as const;
const CARD = "rounded-2xl border border-landing-border bg-white p-4 shadow-landing-soft md:p-6";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-landing-muted";

const paidText = (n: number) => `${n} paid`;
const scoreText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const initialOf = (name: string) => Array.from(name)[0]?.toUpperCase() ?? "?";
/** 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 11 -> 11th. */
const ordinal = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

function TeamDot({ team }: { team: string | null }) {
  if (!team) return null;
  return <span role="img" aria-label={`${team} team`} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TEAM_DOT[team] ?? "bg-slate-300"}`} />;
}

// Gold, silver and bronze finishes, as on the student podium. Gold/amber is a Tailwind accent (the landing tokens have no gold).
const AVATAR_TONE = [
  "bg-gradient-to-br from-yellow-200 to-amber-400 text-amber-900 ring-4 ring-yellow-200/70",
  "bg-gradient-to-br from-white to-slate-200 text-slate-800 ring-4 ring-slate-200",
  "bg-gradient-to-br from-orange-100 to-amber-300 text-amber-900 ring-4 ring-orange-100",
] as const;
const CHIP_TONE = ["bg-amber-500 text-white", "bg-slate-200 text-slate-800", "bg-amber-700 text-white"] as const;
const STEP_TONE = [
  "h-28 bg-gradient-to-b from-landing-mint to-landing-mint-light text-landing-deep shadow-[0_-8px_24px_rgba(126,217,87,0.35)] md:h-36",
  "h-20 bg-gradient-to-b from-slate-200 to-slate-100 text-slate-800 md:h-24",
  "h-14 bg-gradient-to-b from-orange-200 to-orange-100 text-amber-900 md:h-[4.5rem]",
] as const;

function Podium({ rows }: { rows: BoardViewRow[] }) {
  const top = rows.slice(0, 3);
  return (
    <section aria-label="Top three" className="relative min-w-0 rounded-[28px] border border-landing-border bg-white pb-0 pt-5 shadow-[0_12px_40px_rgba(15,61,34,0.10)] md:pt-7">
      {/* Glow and sparkles sit on their own clipped layer. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <div className="absolute inset-x-0 top-0 h-2/3 bg-gradient-to-b from-landing-mint-light to-transparent" />
        <div className="absolute left-1/2 top-16 h-56 w-56 -translate-x-1/2 rounded-full bg-yellow-200/50 blur-3xl" />
        <Sparkles className="absolute left-[12%] top-20 h-5 w-5 text-amber-400/60" />
        <Sparkles className="absolute right-[14%] top-28 h-4 w-4 text-amber-400/50" />
      </div>
      <p className="relative flex items-center gap-2 px-5 text-xs font-bold uppercase tracking-wider text-landing-primary md:px-8 md:text-sm">
        <Trophy aria-hidden className="h-4 w-4" />
        Top affiliates
      </p>
      <ol className="relative mx-auto mt-6 flex min-w-0 max-w-2xl items-end justify-center gap-2.5 px-3 md:mt-8 md:gap-6 md:px-8">
        {top.map((r, i) => {
          const first = i === 0;
          return (
            <li
              key={`${r.rank}-${i}`}
              aria-label={`Podium place ${r.rank}`}
              className={`${PLACE_ORDER[i]} flex min-w-0 max-w-52 flex-1 basis-0 flex-col items-center motion-safe:duration-700 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4`}
            >
              {first ? (
                <Crown aria-hidden className="mb-1.5 h-8 w-8 fill-yellow-300 text-yellow-500 drop-shadow md:h-10 md:w-10" />
              ) : (
                <Medal aria-hidden className={`mb-1.5 h-6 w-6 md:h-7 md:w-7 ${i === 1 ? "text-slate-400" : "text-amber-600"}`} />
              )}
              <span className="relative flex flex-col items-center">
                <span
                  aria-hidden
                  className={`flex shrink-0 items-center justify-center rounded-full font-headline font-black shadow-md ${AVATAR_TONE[i]} ${
                    first ? "h-[4.5rem] w-[4.5rem] text-xl md:h-24 md:w-24 md:text-2xl" : "h-14 w-14 text-base md:h-[4.5rem] md:w-[4.5rem] md:text-xl"
                  }`}
                >
                  {initialOf(r.publicName)}
                </span>
                <span aria-hidden className={`absolute -bottom-2.5 rounded-full px-2.5 py-0.5 font-headline text-xs font-black shadow-sm ${CHIP_TONE[i]}`}>
                  #{r.rank}
                </span>
              </span>
              <span className="mt-4 inline-flex min-w-0 items-center gap-1.5">
                <TeamDot team={r.team} />
                <span className="line-clamp-2 break-words text-center font-headline text-xs font-bold leading-snug text-landing-deep md:text-sm">{r.publicName}</span>
              </span>
              <span className={`mt-1 font-headline font-black leading-none tracking-tight text-landing-deep ${first ? "text-lg md:text-2xl" : "text-base md:text-xl"}`}>
                {paidText(r.paid)}
              </span>
              <span
                aria-hidden
                className={`mt-3 flex w-full items-start justify-center rounded-t-2xl pt-3 font-headline text-sm font-black md:text-base ${STEP_TONE[i]}`}
              >
                {ordinal(r.rank)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RankRow({ row }: { row: BoardViewRow }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-2xl border border-landing-border bg-white p-3.5 shadow-landing-soft md:gap-4 md:px-5">
      <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1 font-headline text-base font-black text-landing-muted">
        <span className="sr-only">Rank </span>
        {row.rank}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <TeamDot team={row.team} />
        <span className="min-w-0 break-words font-headline text-sm font-bold leading-snug text-landing-deep md:text-base">{row.publicName}</span>
      </span>
      <span className="shrink-0 font-headline text-base font-black text-landing-deep md:text-lg">{paidText(row.paid)}</span>
    </li>
  );
}

function RankedList({ rows }: { rows: BoardViewRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const rest = rows.slice(3);
  if (rest.length === 0) return null;
  const visible = showAll ? rest : rest.slice(0, SHOWN_FIRST);
  const hidden = rest.length - visible.length;
  return (
    <section aria-labelledby="board-rest" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="board-rest" className="px-1 text-xs font-bold uppercase tracking-wider text-landing-primary">
        Everyone on the board
      </h2>
      <ul className="flex min-w-0 flex-col gap-2.5">
        {visible.map((r, i) => (
          <RankRow key={`${r.rank}-${i}`} row={r} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto min-h-11 rounded-full border border-landing-border bg-white px-6 text-sm font-bold text-landing-primary shadow-landing-soft"
        >
          {`Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}

function TeamRace({ teams }: { teams: BoardView["teams"] }) {
  return (
    <section aria-labelledby="team-race" className={CARD}>
      <h2 id="team-race" className="font-headline text-lg font-bold text-landing-deep md:text-2xl">
        Team race
      </h2>
      <p className="mt-1 text-xs text-landing-muted md:text-sm">Teams are ranked by paid per active member. An active member has at least one paid sale.</p>
      <ol className="mt-4 grid min-w-0 gap-2.5 md:grid-cols-5">
        {teams.map((t) => (
          <li key={t.team} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-landing-surface p-3 md:flex-col md:items-start">
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-headline text-sm font-black text-landing-muted">
                <span className="sr-only">Rank </span>
                {t.rank}
              </span>
              <TeamDot team={t.team} />
              <span className="font-headline text-sm font-bold text-landing-deep">{t.team}</span>
            </span>
            <span className="text-right md:text-left">
              <span className="block font-headline text-lg font-black leading-tight text-landing-deep">{scoreText(t.score)}</span>
              <span className={`block ${LABEL} normal-case tracking-normal`}>{`${t.paid} paid, ${t.active} active`}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AffiliateBoard({ boards }: { boards: BoardViews }) {
  const [period, setPeriod] = useState<Period>("month");
  const board = boards[period];
  const options: { id: Period; label: string }[] = [
    { id: "month", label: "This month" },
    { id: "all", label: "All time" },
  ];

  return (
    <div data-testid="affiliate-board" className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 md:gap-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-landing-primary">Pharmacozyme Affiliate Programme</p>
        <h1 className="mt-1 font-headline text-2xl font-extrabold text-landing-deep md:text-4xl">Affiliate leaderboard</h1>
      </header>

      <div role="group" aria-label="Show results for" className="flex min-w-0 gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={period === o.id}
            onClick={() => setPeriod(o.id)}
            className={`min-h-11 rounded-full px-5 font-headline text-sm font-bold ${
              period === o.id ? "bg-landing-deep text-white shadow-md" : "border border-landing-border bg-white text-landing-deep"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {board.rows.length === 0 ? (
        <p className="rounded-2xl border border-landing-border bg-white p-5 text-base text-landing-muted">
          {period === "month" ? "No paid sales yet this month. Be the first." : "No paid sales yet. Be the first."}
        </p>
      ) : (
        <>
          <Podium rows={board.rows} />
          <RankedList rows={board.rows} />
        </>
      )}
      <TeamRace teams={board.teams} />
    </div>
  );
}
