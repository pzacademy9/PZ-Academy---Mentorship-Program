"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FlaskConical,
  IdCard,
  LoaderCircle,
  MessageCircle,
  Presentation,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import type { CheckMyProgressResult, FindMyIdByNameResult } from "@/app/progress/actions";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import type { ProgressKind } from "@/lib/progress/build";
import { groupCardsByCourse, type PortalBatchCard } from "@/lib/progress/portal-build";
import { MyIdSection } from "../MyIdSection";
import { MyProgress } from "../MyProgress";

export type PortalGroup = { kind: ProgressKind; batches: PortalBatchCard[] };

const LABELS: Record<ProgressKind, string> = { course: "Courses", workshop: "Workshops", webinar: "Webinars" };
const ONE: Record<ProgressKind, string> = { course: "Course", workshop: "Workshop", webinar: "Webinar" };
const KIND_ICON = { course: BookOpen, workshop: FlaskConical, webinar: Presentation } as const;
const ORDER: ProgressKind[] = ["course", "workshop", "webinar"];
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid";
const ID_ERROR = "Something went wrong. Please try again in a minute.";

interface Props {
  groups: PortalGroup[];
  /** Name lookup. When missing, the Find my ID box is not shown. */
  findId?: (query: string) => Promise<FindMyIdByNameResult>;
  /** PZ ID progress check. When missing, the ID box in the hero is not shown. */
  checkId?: (pzId: string) => Promise<CheckMyProgressResult>;
  /** The batch list could not be loaded. */
  failed?: boolean;
}

export function PortalHome({ groups, findId, checkId, failed = false }: Props) {
  const [tab, setTab] = useState<ProgressKind | "all">("all");
  const [term, setTerm] = useState("");
  // Without the ID box the name search is the main action, so it starts open.
  const [nameOpen, setNameOpen] = useState(!checkId);
  const [idValue, setIdValue] = useState("");
  const [check, setCheck] = useState<CheckMyProgressResult | null>(null);
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<HTMLInputElement>(null);

  // The site menu's "Find my ID" link may arrive with #find-id: open the name search.
  useEffect(() => {
    if (window.location.hash === "#find-id") setNameOpen(true);
  }, []);

  useEffect(() => {
    if (check?.status !== "ok" || !resultRef.current) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    resultRef.current.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
    resultRef.current.focus({ preventScroll: true });
  }, [check]);

  function onCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!checkId) return;
    if (idValue.trim().length < 3) {
      setCheck({ status: "invalid" });
      return;
    }
    startTransition(async () => {
      try {
        setCheck(await checkId(idValue));
      } catch {
        setCheck({ status: "error", message: ID_ERROR });
      }
    });
  }

  function reset() {
    setCheck(null);
    setIdValue("");
    idRef.current?.focus();
  }

  const ordered = ORDER.map((kind) => ({ kind, batches: groups.find((g) => g.kind === kind)?.batches ?? [] }));
  const total = ordered.reduce((n, g) => n + g.batches.length, 0);
  const needle = term.trim().toLowerCase();
  const shown = ordered
    .filter((g) => tab === "all" || g.kind === tab)
    .map((g) => ({ ...g, batches: g.batches.filter((b) => needle === "" || b.title.toLowerCase().includes(needle)) }))
    .filter((g) => g.batches.length > 0);
  const idProblem = check && check.status !== "ok" ? idMessage(check) : null;

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <MarketingHero
        kicker="Student progress"
        title={
          <>
            Track your <span className="text-pz-bright">progress</span>
          </>
        }
        text="Type your PZ ID to see your attendance, quiz points and rank in your batch."
      >
        <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col items-center gap-4">
          {checkId && (
            <form onSubmit={onCheck} noValidate className="flex w-full min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:rounded-full sm:bg-pz-surface-container-lowest sm:p-1.5 sm:shadow-xl">
              <label htmlFor="progress-pz-id" className="sr-only">
                Your PZ ID
              </label>
              <div className="flex min-h-14 min-w-0 flex-1 items-center rounded-full bg-pz-surface-container-lowest px-4 shadow-xl sm:min-h-12 sm:shadow-none">
                <IdCard aria-hidden className="mr-2.5 h-5 w-5 shrink-0 text-pz-outline" />
                <input
                  ref={idRef}
                  id="progress-pz-id"
                  value={idValue}
                  onChange={(e) => setIdValue(e.target.value)}
                  placeholder="Type your PZ ID, like Sara-1234"
                  autoComplete="off"
                  autoCapitalize="words"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-invalid={check?.status === "invalid" || check?.status === "not_found" || undefined}
                  aria-describedby="progress-pz-id-status"
                  className="min-h-11 w-full min-w-0 bg-transparent font-poppins text-base text-pz-on-surface placeholder:text-pz-outline focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                aria-busy={pending || undefined}
                className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-pz-bright px-7 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-[0_8px_24px_rgba(126,217,87,0.3)] transition-transform hover:scale-[1.02] disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:scale-100 ${FOCUS}`}
              >
                {pending ? <LoaderCircle aria-hidden className="h-5 w-5 motion-safe:animate-spin" /> : null}
                {pending ? "Checking..." : "Check progress"}
                {!pending && <ArrowRight aria-hidden className="h-4 w-4" />}
              </button>
            </form>
          )}
          {checkId && (
            <div id="progress-pz-id-status" role="status" aria-live="polite" className="w-full min-w-0 empty:hidden">
              {idProblem && (
                <div className="flex min-w-0 items-start gap-2.5 rounded-2xl bg-pz-surface-container-lowest p-3.5 text-left shadow-lg">
                  <CircleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-pz-academy-error" />
                  <div className="min-w-0">
                    <p className="font-montserrat text-sm font-bold text-pz-on-surface">{idProblem.title}</p>
                    <p className="mt-0.5 break-words font-poppins text-sm text-pz-on-surface-variant">{idProblem.body}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {findId && checkId && (
            <button
              type="button"
              aria-expanded={nameOpen}
              aria-controls="find-id"
              onClick={() => setNameOpen((o) => !o)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-poppins text-[15px] text-white/85 underline decoration-pz-bright/60 underline-offset-4 transition-colors hover:text-white ${FOCUS}`}
            >
              <Search aria-hidden className="h-4 w-4" />
              Forgot your ID? Find it by name
              <ChevronDown aria-hidden className={`h-4 w-4 transition-transform motion-reduce:transition-none ${nameOpen ? "rotate-180" : ""}`} />
            </button>
          )}
          {findId && nameOpen && (
            <div
              id="find-id"
              className="w-full min-w-0 scroll-mt-28 rounded-[24px] bg-pz-surface-container-lowest p-5 text-left shadow-xl motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 sm:p-6"
            >
              <MyIdSection findId={findId} />
            </div>
          )}

          <p className="flex min-w-0 items-center justify-center gap-2 text-center font-poppins text-sm text-white/75">
            <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-pz-bright" />
            <span>Names and IDs only. No phone or email shown.</span>
          </p>
        </div>
      </MarketingHero>

      {check?.status === "ok" && (
        <div ref={resultRef} tabIndex={-1} className="scroll-mt-24 bg-pz-web-surface px-5 pt-10 focus:outline-none md:px-6">
          <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">Your progress</span>
              <button
                type="button"
                onClick={reset}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-pz-surface-container-lowest px-4 font-montserrat text-sm font-bold text-pz-deep shadow-sm ring-1 ring-pz-outline-variant/40 hover:bg-pz-web-surface-low ${FOCUS}`}
              >
                <RotateCcw aria-hidden className="h-4 w-4" />
                Check another ID
              </button>
            </div>
            <MyProgress progress={check.progress} standings={check.standings} />
          </div>
        </div>
      )}

      <section aria-label="All batches" className="w-full bg-pz-web-surface px-5 pb-16 pt-10 md:px-6 md:pt-14">
        <div className="mx-auto flex w-full min-w-0 max-w-[1320px] flex-col gap-8">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">Every batch</span>
              <p className="font-montserrat text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-pz-deep md:text-[34px]">Leaderboards and attendance</p>
              <p className="font-poppins text-sm text-pz-muted md:text-base">Open a batch to see who is on top, and every student&apos;s classes.</p>
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
              <div className="flex min-h-12 min-w-0 flex-1 items-center rounded-full bg-pz-surface-container-lowest px-4 shadow-sm ring-1 ring-pz-outline-variant/40 focus-within:ring-2 focus-within:ring-pz-solid-mid sm:w-72 sm:flex-none">
                <Search aria-hidden className="mr-2 h-5 w-5 shrink-0 text-pz-outline" />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  aria-label="Search a batch"
                  placeholder="Search a batch"
                  className="min-h-11 w-full min-w-0 bg-transparent font-poppins text-base text-pz-on-surface placeholder:text-pz-outline focus:outline-none"
                />
              </div>
              <div role="tablist" aria-label="Batch type" className="flex min-w-0 gap-1 rounded-full bg-pz-surface-container-lowest p-1 shadow-sm ring-1 ring-pz-outline-variant/40">
                {ordered.map((g) => (
                  <button
                    key={g.kind}
                    type="button"
                    role="tab"
                    aria-selected={tab === g.kind}
                    onClick={() => setTab(tab === g.kind ? "all" : g.kind)}
                    className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 font-montserrat text-[13px] font-bold transition-colors motion-reduce:transition-none sm:px-4 sm:text-sm ${FOCUS} ${
                      tab === g.kind ? "bg-pz-solid-deep text-white shadow-sm" : "text-pz-muted hover:bg-pz-web-surface-low"
                    }`}
                  >
                    {LABELS[g.kind]}
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-poppins text-xs ${tab === g.kind ? "bg-pz-bright text-pz-solid-deep" : "bg-pz-web-surface-high text-pz-deep"}`}
                    >
                      {g.batches.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {failed ? (
            <p role="alert" className="rounded-[20px] bg-pz-error-container p-5 font-poppins text-base text-pz-on-error-container">
              We could not load the batches right now. Please try again in a minute.
            </p>
          ) : total === 0 ? (
            <p className="rounded-[20px] bg-pz-surface-container-lowest p-5 font-poppins text-base text-pz-muted">No batches yet</p>
          ) : shown.length === 0 ? (
            <p className="rounded-[20px] bg-pz-surface-container-lowest p-5 font-poppins text-base text-pz-muted">No batches match your search.</p>
          ) : (
            shown.map((g) => {
              const Icon = KIND_ICON[g.kind];
              return (
                <section key={g.kind} aria-labelledby={`group-${g.kind}`} className="flex min-w-0 flex-col gap-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pz-solid-deep text-pz-bright">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h2 id={`group-${g.kind}`} className="font-montserrat text-2xl font-extrabold tracking-[-0.02em] text-pz-deep">
                      {LABELS[g.kind]}
                    </h2>
                    <span className="rounded-full bg-pz-web-surface-high px-2.5 py-0.5 font-poppins text-xs font-bold text-pz-deep">
                      {g.batches.length} {g.batches.length === 1 ? "batch" : "batches"}
                    </span>
                  </div>
                  {groupCardsByCourse(g.batches).map((cg) => (
                    <div key={cg.key} className="flex min-w-0 flex-col gap-3">
                      <h3 className="break-words font-poppins text-sm font-bold uppercase tracking-wider text-pz-muted">{cg.heading}</h3>
                      <ul className="grid min-w-0 gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-7">
                        {cg.batches.map((b) => (
                          <li key={b.slug} className="min-w-0">
                            <BatchCard batch={b} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              );
            })
          )}

          <div className="flex min-w-0 flex-col gap-4 rounded-[24px] bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.06)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pz-primary-container text-pz-on-primary-container">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-montserrat text-base font-bold text-pz-deep">Can&apos;t find your ID or your batch?</p>
                <p className="font-poppins text-sm text-pz-muted">Message the PZ Academy team on WhatsApp and we will help.</p>
              </div>
            </div>
            <a
              href="https://wa.me/923700199429"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-pz-solid-deep px-6 font-montserrat text-[15px] font-bold text-white transition-colors hover:bg-pz-solid-forest ${FOCUS}`}
            >
              WhatsApp +92 370 019 9429
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function idMessage(r: Exclude<CheckMyProgressResult, { status: "ok" }>): { title: string; body: string } {
  switch (r.status) {
    case "invalid":
      return { title: "Check your ID", body: "Type your full PZ ID, like Sara-1234. Forgot it? Find it by name below." };
    case "not_found":
      return { title: "We could not find that ID", body: "Check the spelling, or find your ID by name below." };
    case "rate_limited":
      return { title: "Too many tries", body: "Please wait a few minutes, then try again." };
    case "error":
      return { title: "Something went wrong", body: r.message };
  }
}

const STATE_CHIP: Record<PortalBatchCard["state"], { text: string; cls: string }> = {
  live: { text: "Live", cls: "bg-pz-bright text-pz-solid-deep" },
  completed: { text: "Completed", cls: "bg-white/90 text-pz-solid-deep" },
  recorded: { text: "Recorded", cls: "bg-white/90 text-pz-solid-deep" },
};

function BatchCard({ batch: b }: { batch: PortalBatchCard }) {
  const chip = STATE_CHIP[b.state];
  const pct = b.classesTotal > 0 ? Math.round((b.classesHeld / b.classesTotal) * 100) : 0;
  const recorded = b.state === "recorded";
  const done = b.state === "completed";
  const Icon = KIND_ICON[b.kind];
  const cta = recorded ? "View batch progress" : done ? "See final leaderboard" : "See leaderboard";
  const CtaIcon = done ? Trophy : recorded ? ArrowRight : TrendingUp;
  return (
    <Link
      href={`/progress/${b.slug}`}
      prefetch={false}
      className={`group flex h-full min-w-0 flex-col gap-4 rounded-[24px] bg-pz-surface-container-lowest p-4 shadow-[0_8px_30px_rgba(15,61,34,0.06)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,61,34,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5 ${FOCUS}`}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-[16px] bg-pz-web-surface-high">
        {b.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Drive covers go through /api/cover; fixed aspect box prevents layout shift
          <img
            src={coverProxyUrl(b.coverUrl)}
            alt=""
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div
            data-cover-placeholder
            aria-hidden
            className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pz-solid-deep to-pz-solid-mid text-pz-bright"
          >
            <Icon className="h-12 w-12 opacity-80" strokeWidth={1.5} />
          </div>
        )}
        <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-poppins text-xs font-bold shadow-sm ${chip.cls}`}>
          {b.state === "live" && <span aria-hidden className="h-2 w-2 rounded-full bg-pz-solid-mid motion-safe:animate-pulse" />}
          {done && <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-pz-mid" />}
          {chip.text}
        </span>
        <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-pz-solid-deep/80 px-2 py-0.5 font-poppins text-xs font-semibold text-white backdrop-blur-sm">
          {ONE[b.kind]}
        </span>
      </div>

      <h4 className="min-w-0 break-words font-montserrat text-lg font-bold leading-snug tracking-[-0.01em] text-pz-deep md:text-xl">{b.title}</h4>

      <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-pz-web-surface-low p-3.5">
        {recorded ? (
          <p className="font-poppins text-sm font-semibold text-pz-deep">Self-paced</p>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 font-poppins text-sm font-semibold text-pz-deep">
                <CalendarCheck2 aria-hidden className="h-4 w-4 text-pz-mid" />
                Classes
              </span>
              <span className="font-montserrat text-xs font-bold text-pz-mid">
                {b.classesHeld} of {b.classesTotal} classes held
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Classes held"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-2.5 overflow-hidden rounded-full bg-pz-web-surface-high"
            >
              <div className={`h-full rounded-full ${done ? "bg-pz-solid-mid" : "bg-gradient-to-r from-pz-solid-mid to-pz-bright"}`} style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        <span className="flex items-center gap-1.5 font-poppins text-xs text-pz-muted">
          <Users aria-hidden className="h-3.5 w-3.5" />
          {b.students} {b.students === 1 ? "student" : "students"}
        </span>
      </div>

      <span
        className={`mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full font-montserrat text-[15px] font-bold transition-colors ${
          b.state === "live"
            ? "bg-pz-bright text-pz-solid-deep shadow-[0_6px_18px_rgba(126,217,87,0.3)]"
            : "bg-pz-web-surface-low text-pz-deep group-hover:bg-pz-web-surface-high"
        }`}
      >
        {cta}
        <CtaIcon aria-hidden className="h-4 w-4" />
      </span>
    </Link>
  );
}
