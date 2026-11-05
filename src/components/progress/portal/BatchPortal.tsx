"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ChevronLeft, Info, ListChecks, LocateFixed, Search, Trophy } from "lucide-react";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import { rowsFor } from "@/lib/progress/leaderboard";
import type { PortalBatchView } from "@/lib/progress/portal-build";
import { btnFocus, inputClass } from "../ui";
import { AttendanceList } from "./AttendanceList";
import { FindMe } from "./FindMe";
import { Leaderboard } from "./Leaderboard";

const STATE_CHIP = {
  live: { text: "Live", cls: "bg-pz-bright text-pz-solid-deep" },
  completed: { text: "Completed", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed" },
  recorded: { text: "Recorded", cls: "bg-white/15 text-white" },
} as const;

const TABS = [
  { id: "leaderboard", label: "Leaderboard", Icon: Trophy },
  { id: "attendance", label: "Attendance", Icon: ListChecks },
  { id: "findme", label: "Find me", Icon: LocateFixed },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** Lower-case and drop spaces so "sample 0001" and "Sample-0001" style typing both work. */
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const matching = <T extends { name: string; pzId: string }>(rows: T[], term: string): T[] => {
  const needle = squash(term);
  return needle === "" ? rows : rows.filter((r) => squash(r.name).includes(needle) || squash(r.pzId).includes(needle));
};

export function BatchPortal({ view }: { view: PortalBatchView }) {
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [term, setTerm] = useState("");
  const [pick, setPick] = useState("overall");
  const [attTerm, setAttTerm] = useState("");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const matches = matching(view.attendance, term);
  const highlight = squash(term) !== "" && matches.length === 1 ? matches[0].pzId : null;
  const attendance = matching(view.attendance, attTerm);

  // Tabs pattern: arrows move between tabs (wrapping), Home/End jump to the ends; the moved-to tab is shown.
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? (at + 1) % TABS.length : e.key === "ArrowLeft" ? (at - 1 + TABS.length) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const rows = rowsFor(view, pick);
  const chip = STATE_CHIP[view.state];

  return (
    <div className="flex w-full min-w-0 flex-col">
      <header className="relative isolate overflow-hidden bg-pz-solid-deep text-white">
        <div aria-hidden className="absolute inset-0 -z-10">
          {view.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Drive covers go through /api/cover; decorative backdrop
            <img src={coverProxyUrl(view.coverUrl)} alt="" decoding="async" className="h-full w-full object-cover opacity-20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-pz-solid-deep/70 via-pz-solid-deep/90 to-pz-solid-deep" />
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-pz-bright/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-pz-solid-mid/30 blur-3xl" />
        </div>
        <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 px-5 pb-6 pt-[6.25rem] md:px-6 md:pb-8 md:pt-[7.5rem]">
          <Link
            href="/progress"
            className={`-ml-2 inline-flex min-h-11 w-fit min-w-0 items-center gap-1 rounded-full px-2 font-poppins text-sm font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white ${btnFocus}`}
          >
            <ChevronLeft aria-hidden className="h-5 w-5 shrink-0" />
            <span className="truncate">Progress Portal</span>
          </Link>
          <div className="flex min-w-0 flex-col gap-3">
            <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider ${chip.cls}`}>
              {view.state === "live" && <span aria-hidden className="h-2 w-2 rounded-full bg-pz-solid-mid motion-safe:animate-pulse" />}
              {chip.text}
            </span>
            <h1 className="min-w-0 break-words font-montserrat text-[28px] font-extrabold leading-[1.15] tracking-[-0.025em] text-white sm:text-4xl md:text-[44px]">{view.title}</h1>
            <p className="flex min-w-0 flex-wrap gap-2 font-poppins text-sm text-white/85">
              <span className="rounded-full bg-white/10 px-3 py-1">
                {view.classesHeld} {view.classesHeld === 1 ? "class" : "classes"} held
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                {view.students} {view.students === 1 ? "student" : "students"}
              </span>
            </p>
          </div>
          <div role="tablist" aria-label="Batch lists" onKeyDown={onTabKey} className="mt-1 grid min-w-0 grid-cols-3 gap-1 rounded-2xl bg-white/10 p-1 sm:max-w-xl">
            {TABS.map(({ id, label, Icon }, i) => (
              <button
                key={id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                aria-controls={tab === id ? `panel-${id}` : undefined}
                onClick={() => setTab(id)}
                className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 font-montserrat text-[13px] font-bold transition-colors motion-reduce:transition-none sm:min-h-12 sm:flex-row sm:gap-2 sm:text-sm ${btnFocus} ${
                  tab === id ? "bg-pz-bright text-pz-solid-deep shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <section
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="mx-auto mt-6 flex w-full min-w-0 max-w-5xl flex-col gap-5 px-4 sm:px-6"
      >
        {tab === "leaderboard" && <Leaderboard view={view} pick={pick} onPick={setPick} rows={rows} highlight={highlight} />}
        {tab === "attendance" && (
          <>
            <p className="flex min-w-0 items-start gap-2 rounded-xl bg-pz-tertiary-container px-3.5 py-2.5 text-sm text-pz-on-tertiary-container">
              <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Minimum attendance: {view.minPct}%</span>
            </p>
            {view.attendance.length === 0 ? (
              <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No students yet</p>
            ) : (
              <>
                <div className="relative min-w-0">
                  <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-pz-outline" />
                  <input
                    type="search"
                    value={attTerm}
                    onChange={(e) => setAttTerm(e.target.value)}
                    aria-label="Search by name or PZ ID"
                    placeholder="Search by name or PZ ID"
                    className={`${inputClass} pl-11`}
                  />
                </div>
                <p role="status" aria-live="polite" className="-mt-2 text-sm text-pz-on-surface-variant">
                  Showing {attendance.length} of {view.attendance.length}
                </p>
                {attendance.length === 0 ? (
                  <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No one matches</p>
                ) : (
                  <AttendanceList rows={attendance} minPct={view.minPct} />
                )}
              </>
            )}
          </>
        )}
        {tab === "findme" && (
          <FindMe view={view} pick={pick} onPick={setPick} rows={rows} term={term} onTerm={setTerm} matches={matches} highlight={highlight} />
        )}
      </section>
    </div>
  );
}
