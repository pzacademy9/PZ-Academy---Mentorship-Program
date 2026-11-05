"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  Check,
  Clock3,
  Crown,
  PlayCircle,
  Share2,
  TriangleAlert,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { formatPkt } from "@/lib/attendance/rules";
import type { Progress, ProgressBatch, ProgressKind } from "@/lib/progress/build";
import { initials } from "@/lib/progress/leaderboard";
import {
  attendanceRing,
  badgesFor,
  fmtNumber,
  gapText,
  ledgerRows,
  nextClassNumber,
  scoreMax,
  shareProgressHref,
  type LedgerRow,
  type Standing,
} from "@/lib/progress/my-progress";
import { CopyPzId } from "./CopyPzId";
import { btnFocus } from "./ui";

const KIND_LABEL: Record<ProgressKind, string> = { course: "Course", workshop: "Workshop", webinar: "Webinar" };
const CARD = "rounded-[24px] bg-pz-surface-container-lowest shadow-[0_8px_30px_rgba(15,61,34,0.06)] ring-1 ring-pz-outline-variant/30";
const KICKER = "font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid";

interface Props {
  progress: Progress;
  /** Overall-board standing per batch slug (rank, gap, max). Missing = no rank shown. */
  standings?: Record<string, Standing>;
  /** "h1" with a greeting on the signed-in page; "h2" under the public page's own heading. */
  nameAs?: "h1" | "h2";
}

type Entry = { kind: ProgressKind; batch: ProgressBatch };

export function MyProgress({ progress, standings = {}, nameAs = "h2" }: Props) {
  const entries: Entry[] = progress.groups.flatMap((g) => g.batches.map((batch) => ({ kind: g.kind, batch })));
  const first = Math.max(0, entries.findIndex((e) => e.batch.latest));
  const [at, setAt] = useState(first);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = entries[Math.min(at, entries.length - 1)];
  const standing = current ? (standings[current.batch.slug] ?? null) : null;
  const rank = current?.batch.mode === "live" && standing?.rank != null ? standing : null;
  const Name = nameAs;
  const Sub = nameAs === "h1" ? "h2" : "h3";

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = entries.length;
    const next =
      e.key === "ArrowRight" ? (at + 1) % n : e.key === "ArrowLeft" ? (at - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setAt(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section aria-label="Your progress" className="flex w-full min-w-0 flex-col gap-4 sm:gap-5">
      {entries.length > 1 && (
        <div
          role="tablist"
          aria-label="Your batches"
          onKeyDown={onTabKey}
          className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {entries.map((e, i) => (
            <button
              key={`${e.kind}-${e.batch.slug}-${i}`}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`my-batch-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={i === at}
              aria-controls={i === at ? "my-batch-panel" : undefined}
              tabIndex={i === at ? 0 : -1}
              onClick={() => setAt(i)}
              className={`flex min-h-11 max-w-[16rem] shrink-0 flex-col items-start justify-center rounded-2xl px-4 py-1.5 text-left transition-colors motion-reduce:transition-none ${btnFocus} ${
                i === at
                  ? "bg-pz-solid-deep text-white shadow-md"
                  : "bg-pz-surface-container-lowest text-pz-deep ring-1 ring-pz-outline-variant/40 hover:bg-pz-web-surface-low"
              }`}
            >
              <span className={`font-poppins text-[11px] font-bold uppercase tracking-wider ${i === at ? "text-pz-bright" : "text-pz-muted"}`}>
                {KIND_LABEL[e.kind]}
              </span>
              <span className="max-w-full truncate font-montserrat text-sm font-bold">{e.batch.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Header: who, which ID, which batch, and the live rank when there is one. */}
      <div className={`${CARD} relative overflow-hidden p-5 sm:p-7`}>
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-pz-bright/20 blur-3xl" />
        <div className="relative flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-56 items-start gap-4">
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pz-bright to-pz-solid-mid font-montserrat text-lg font-black text-white shadow-md sm:h-16 sm:w-16 sm:text-xl"
            >
              {initials(progress.firstName)}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Name className="break-words font-montserrat text-2xl font-extrabold leading-tight tracking-[-0.02em] text-pz-deep sm:text-3xl">
                {nameAs === "h1" ? `Hello, ${progress.firstName}` : progress.firstName}
              </Name>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-muted">PZ ID</span>
                <span className="break-all rounded-lg bg-pz-web-surface-low px-2.5 py-1 font-mono text-sm font-bold text-pz-deep">{progress.pzId}</span>
                <CopyPzId pzId={progress.pzId} />
              </div>
              {current && (
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-poppins text-sm text-pz-muted">
                  <span className="break-words font-semibold text-pz-deep">{current.batch.title}</span>
                  <span aria-hidden>·</span>
                  <span>{current.batch.mode === "live" ? "Live student" : "Recorded student"}</span>
                </p>
              )}
            </div>
          </div>
          {rank && (
            <p className="flex w-full shrink-0 items-baseline justify-center gap-2 rounded-2xl bg-pz-bright px-5 py-2.5 text-pz-solid-deep shadow-[0_8px_24px_rgba(126,217,87,0.35)] sm:w-auto sm:flex-col sm:items-center sm:gap-0">
              <span className="font-poppins text-[11px] font-bold uppercase tracking-wider">Batch rank</span>
              <span className="font-montserrat text-3xl font-black leading-none">
                <span className="sr-only">Rank </span>#{rank.rank}
              </span>
              <span className="font-poppins text-xs font-semibold">of {rank.of}</span>
            </p>
          )}
        </div>
      </div>

      {!current ? (
        <p className={`${CARD} p-5 font-poppins text-base text-pz-muted`}>
          We found your ID, but there are no classes to show yet. Please check again after your first class.
        </p>
      ) : (
        <div
          key={`${current.batch.slug}-${at}`}
          id="my-batch-panel"
          role={entries.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={entries.length > 1 ? `my-batch-tab-${at}` : undefined}
          className="flex min-w-0 flex-col gap-4 motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 sm:gap-5"
        >
          <BatchBody batch={current.batch} standing={standing} Sub={Sub} />
        </div>
      )}
    </section>
  );
}

function BatchBody({ batch, standing, Sub }: { batch: ProgressBatch; standing: Standing | null; Sub: "h2" | "h3" }) {
  const live = batch.mode === "live";
  const gap = live ? gapText(standing) : null;
  const badges = badgesFor(batch, standing);
  const ledger = ledgerRows(batch);
  const next = nextClassNumber(ledger);
  const nextRow = ledger.find((r) => r.number === next) ?? null;

  return (
    <>
      {gap && (
        <p className="flex min-w-0 items-center gap-3 rounded-[20px] bg-pz-secondary-fixed px-4 py-3.5 font-poppins text-base text-pz-on-secondary-fixed sm:px-5">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pz-secondary-container text-pz-on-secondary-container">
            {standing?.rank === 1 ? <Crown className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
          </span>
          <span className="min-w-0 font-semibold">{gap}</span>
        </p>
      )}

      <div className={`grid min-w-0 gap-4 sm:grid-cols-2 sm:gap-5 ${nextRow ? "lg:grid-cols-3" : ""}`}>
        <AttendanceCard batch={batch} Sub={Sub} />
        <ScoreCard batch={batch} standing={standing} Sub={Sub} />
        {nextRow && <NextClassCard row={nextRow} Sub={Sub} />}
      </div>

      {badges.length > 0 && (
        <div className="flex min-w-0 flex-col gap-3">
          <Sub className="font-montserrat text-lg font-bold text-pz-deep">Badges</Sub>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {badges.map((b) => (
              <li key={b.id} className={`${CARD} flex min-w-0 items-center gap-3 p-4`}>
                <span
                  aria-hidden
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    b.id === "top-3" ? "bg-pz-secondary-container text-pz-on-secondary-container" : "bg-pz-primary-container text-pz-on-primary-container"
                  }`}
                >
                  {b.id === "top-3" ? <Trophy className="h-5 w-5" /> : <CalendarCheck2 className="h-5 w-5" />}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-montserrat text-base font-bold text-pz-deep">{b.label}</span>
                  <span className="font-poppins text-sm text-pz-muted">{b.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <Sub className="font-montserrat text-lg font-bold text-pz-deep">Class by class</Sub>
          <span className="font-poppins text-sm font-semibold text-pz-muted">
            {ledger.length} {ledger.length === 1 ? "class" : "classes"}
          </span>
        </div>
        {ledger.length === 0 ? (
          <p className={`${CARD} p-5 font-poppins text-base text-pz-muted`}>No classes to show yet.</p>
        ) : (
          <ol aria-label="Class by class" className="flex min-w-0 flex-col gap-2.5">
            {ledger.map((r) => (
              <LedgerItem key={r.number} row={r} isNext={r.number === next} />
            ))}
          </ol>
        )}
        {!live && <p className="font-poppins text-sm text-pz-muted">Recorded students are not ranked. Ranks are shown for live students only.</p>}
      </div>

      <ShareRow batch={batch} />
    </>
  );
}

function AttendanceCard({ batch, Sub }: { batch: ProgressBatch; Sub: "h2" | "h3" }) {
  const a = batch.attendance;
  const ring = attendanceRing(a);
  const R = 38;
  const C = 2 * Math.PI * R;
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-4 p-5`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Sub className={KICKER}>Attendance</Sub>
        {a && a.held > 0 && (
          <span className="font-montserrat text-lg font-black text-pz-deep">
            {a.attended} / {a.held}
          </span>
        )}
      </div>
      {!a ? (
        <p className="flex items-start gap-2 font-poppins text-sm text-pz-muted">
          <PlayCircle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
          Attendance is not tracked for recorded students.
        </p>
      ) : !ring ? (
        <p className="font-poppins text-sm text-pz-muted">No classes held yet. Your attendance shows here after your first class.</p>
      ) : (
        <div className="flex min-w-0 items-center gap-4">
          <svg viewBox="0 0 96 96" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label={`Attended ${a.attended} of ${a.held} classes (${ring.pct}%)`}>
            <circle cx="48" cy="48" r={R} fill="none" strokeWidth="10" className="stroke-pz-web-surface-high" />
            <circle
              cx="48"
              cy="48"
              r={R}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ring.dash)}
              className={`${a.meetsMin ? "stroke-pz-solid-mid" : "stroke-pz-gold"} motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700`}
            />
            <text x="48" y="48" dy="0.35em" textAnchor="middle" transform="rotate(90 48 48)" className="fill-pz-on-surface font-montserrat text-[20px] font-black">
              {ring.pct}%
            </text>
          </svg>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="font-poppins text-sm text-pz-muted">
              Attended {a.attended} of {a.held} {a.held === 1 ? "class" : "classes"} held
            </p>
            {a.meetsMin ? (
              <p className="flex items-center gap-1.5 font-poppins text-sm font-bold text-pz-mid">
                <Check aria-hidden className="h-4 w-4 shrink-0" />
                Meets the {a.minPct}% minimum
              </p>
            ) : (
              <p className="flex items-center gap-1.5 font-poppins text-sm font-bold text-pz-on-surface">
                <TriangleAlert aria-hidden className="h-4 w-4 shrink-0 text-pz-gold" />
                Below the {a.minPct}% minimum
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ batch, standing, Sub }: { batch: ProgressBatch; standing: Standing | null; Sub: "h2" | "h3" }) {
  const scored = batch.results.rows.length > 0;
  const max = scored ? scoreMax(batch, standing) : null;
  const pct = max ? Math.min(100, Math.round((batch.results.total / max) * 100)) : null;
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-4 p-5`}>
      <Sub className={KICKER}>Quiz points</Sub>
      {!scored ? (
        <p className="font-poppins text-sm text-pz-muted">No quiz scores yet. Your points show here after your first quiz.</p>
      ) : (
        <>
          <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-montserrat text-4xl font-black leading-none tracking-tight text-pz-deep">{fmtNumber(batch.results.total)}</span>
            <span className="font-poppins text-sm font-semibold text-pz-muted">{max !== null ? `of ${fmtNumber(max)} points` : "points"}</span>
          </p>
          {pct !== null && (
            <div
              role="progressbar"
              aria-label="Quiz points"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-2.5 overflow-hidden rounded-full bg-pz-web-surface-high"
            >
              <div className="h-full rounded-full bg-gradient-to-r from-pz-solid-mid to-pz-bright" style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="font-poppins text-sm text-pz-muted">
            From {batch.results.rows.length} {batch.results.rows.length === 1 ? "quiz" : "quizzes"}
          </p>
        </>
      )}
    </div>
  );
}

function NextClassCard({ row, Sub }: { row: LedgerRow; Sub: "h2" | "h3" }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[24px] bg-pz-solid-deep p-5 text-white shadow-[0_8px_30px_rgba(15,61,34,0.18)] sm:col-span-2 lg:col-span-1">
      <Sub className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">Next class</Sub>
      <p className="break-words font-montserrat text-lg font-bold leading-snug">
        Class {row.number} · {row.title}
      </p>
      <p className="flex items-center gap-2 font-poppins text-sm text-white/80">
        <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-pz-bright" />
        {formatPkt(row.startsAt)}
      </p>
    </div>
  );
}

const STATE = {
  "check-in": { text: "Present (check-in)", chip: "bg-pz-primary-container text-pz-on-primary-container", dot: "bg-pz-bright text-pz-solid-deep", Icon: Check },
  admin: { text: "Present (by admin)", chip: "bg-pz-tertiary-container text-pz-on-tertiary-container", dot: "bg-pz-bright text-pz-solid-deep", Icon: Check },
  absent: { text: "Absent", chip: "bg-pz-error-container text-pz-on-error-container", dot: "bg-pz-error-container text-pz-on-error-container", Icon: X },
  upcoming: { text: "Upcoming", chip: "bg-pz-surface-container-high text-pz-on-surface-variant", dot: "bg-pz-surface-container-high text-pz-on-surface-variant", Icon: Clock3 },
} as const;

function LedgerItem({ row, isNext }: { row: LedgerRow; isNext: boolean }) {
  const key = row.state === "present" ? (row.how === "admin" ? "admin" : "check-in") : row.state;
  const s = key ? STATE[key] : null;
  const upcoming = row.state === "upcoming";
  return (
    <li
      className={`flex min-w-0 items-center gap-2.5 rounded-[20px] p-3 sm:gap-4 sm:p-3.5 sm:px-5 ${
        isNext
          ? "bg-pz-surface-container-lowest ring-2 ring-pz-bright"
          : upcoming
            ? "bg-pz-web-surface-low ring-1 ring-pz-outline-variant/30"
            : "bg-pz-surface-container-lowest shadow-[0_4px_16px_rgba(15,61,34,0.05)] ring-1 ring-pz-outline-variant/30"
      }`}
    >
      {s ? (
        <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10 ${s.dot}`}>
          <s.Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      ) : (
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pz-web-surface-high font-montserrat text-sm font-black text-pz-deep sm:h-10 sm:w-10">
          {row.number}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="break-words font-montserrat text-sm font-bold leading-snug text-pz-deep sm:text-base">
          Class {row.number} · {row.title}
        </p>
        <p className="font-poppins text-xs text-pz-muted sm:text-sm">{formatPkt(row.startsAt)}</p>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {isNext ? (
            <span className="rounded-full bg-pz-bright px-2.5 py-0.5 font-poppins text-xs font-bold text-pz-solid-deep">Next class</span>
          ) : (
            s && <span className={`rounded-full px-2.5 py-0.5 font-poppins text-xs font-bold ${s.chip}`}>{s.text}</span>
          )}
          {row.rank !== null && row.of !== null && (
            <span className="rounded-full bg-pz-web-surface-low px-2.5 py-0.5 font-poppins text-xs font-bold text-pz-deep">
              Class rank {row.rank} of {row.of}
            </span>
          )}
        </div>
      </div>
      {row.score !== null && (
        <p className="flex shrink-0 flex-col items-end text-right">
          <span className="font-montserrat text-lg font-black leading-tight text-pz-mid sm:text-xl">
            <span className="sr-only">Score: </span>
            {fmtNumber(row.score)}
          </span>
          <span className="font-poppins text-xs font-semibold text-pz-muted">{row.max !== null ? `of ${fmtNumber(row.max)} pts` : "points"}</span>
        </p>
      )}
    </li>
  );
}

function ShareRow({ batch }: { batch: ProgressBatch }) {
  const onShare = () => {
    const href = shareProgressHref(batch.title, window.location.origin, batch.slug);
    window.open(href, "_blank", "noopener,noreferrer");
  };
  return (
    <div className={`${CARD} flex min-w-0 flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between`}>
      <div className="min-w-0">
        <p className="font-montserrat text-base font-bold text-pz-deep">Share your batch</p>
        <p className="font-poppins text-sm text-pz-muted">Sends the batch leaderboard link only. Your ID and scores are not included.</p>
      </div>
      <div className="flex min-w-0 shrink-0 flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-pz-bright px-6 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-[0_8px_24px_rgba(126,217,87,0.3)] transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          <Share2 aria-hidden className="h-4 w-4" />
          Share on WhatsApp
        </button>
        <Link
          href={`/progress/${encodeURIComponent(batch.slug)}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-pz-web-surface-low px-6 font-montserrat text-[15px] font-bold text-pz-deep transition-colors hover:bg-pz-web-surface-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid"
        >
          See batch leaderboard
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
