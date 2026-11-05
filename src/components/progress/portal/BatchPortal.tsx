"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Info, ListChecks, LocateFixed, Trophy } from "lucide-react";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import { podium, resolvePodiumPick, rowsFor } from "@/lib/progress/leaderboard";
import type { PortalBatchView } from "@/lib/progress/portal-build";
import { btnFocus } from "../ui";
import { AttendanceList } from "./AttendanceList";
import { FindMe } from "./FindMe";
import { Leaderboard } from "./Leaderboard";
import { SharePodium } from "./SharePodium";

const STATE_CHIP = {
  live: { text: "Live", cls: "bg-pz-primary-container text-pz-on-primary-fixed" },
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

export function BatchPortal({ view }: { view: PortalBatchView }) {
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [term, setTerm] = useState("");
  const [pick, setPick] = useState("overall");

  const needle = squash(term);
  const matches = needle === "" ? view.attendance : view.attendance.filter((r) => squash(r.name).includes(needle) || squash(r.pzId).includes(needle));
  const highlight = needle !== "" && matches.length === 1 ? matches[0].pzId : null;

  const rows = rowsFor(view, pick);
  const canShare = podium(rows).length > 0;
  const pickLabel = resolvePodiumPick(view, pick)?.label ?? "Overall";
  const chip = STATE_CHIP[view.state];

  return (
    <div className="flex w-full min-w-0 flex-col">
      <header className="relative isolate overflow-hidden rounded-b-2xl bg-pz-solid-deep text-white shadow-md sm:mx-4 sm:rounded-2xl lg:mx-auto lg:w-full lg:max-w-5xl">
        {view.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Drive covers go through /api/cover; decorative backdrop
          <img src={coverProxyUrl(view.coverUrl)} alt="" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-20" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-pz-solid-deep/60 to-pz-solid-deep" />
        <div className="flex min-w-0 flex-col gap-3 px-4 pb-5 pt-3 sm:px-6 sm:pb-6 sm:pt-5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <Link
              href="/progress"
              className={`-ml-2 inline-flex min-h-11 min-w-0 items-center gap-1 rounded-lg px-2 font-headline text-sm font-bold text-pz-tertiary-fixed hover:bg-white/10 ${btnFocus}`}
            >
              <ChevronLeft aria-hidden className="h-5 w-5 shrink-0" />
              <span className="truncate">Progress Portal</span>
            </Link>
            {canShare && <SharePodium slug={view.slug} title={view.title} pick={pick} label={pickLabel} />}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 break-words font-headline text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">{view.title}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-headline text-xs font-black uppercase tracking-wide ${chip.cls}`}>
              {view.state === "live" && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pz-primary motion-safe:animate-pulse" />}
              {chip.text}
            </span>
          </div>
          <p className="flex min-w-0 flex-wrap gap-x-2 text-sm text-pz-secondary-fixed">
            <span>
              {view.classesHeld} {view.classesHeld === 1 ? "class" : "classes"} held
            </span>
            <span aria-hidden>·</span>
            <span>
              {view.students} {view.students === 1 ? "student" : "students"}
            </span>
          </p>
          <div role="tablist" aria-label="Batch lists" className="mt-1 flex min-w-0 gap-1 rounded-xl bg-white/10 p-1 sm:max-w-xl">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 font-headline text-xs font-bold transition-colors motion-reduce:transition-none sm:text-sm ${btnFocus} ${
                  tab === id ? "bg-pz-primary-container text-pz-on-primary-fixed shadow-sm" : "text-pz-tertiary-fixed hover:bg-white/10"
                }`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0 max-[379px]:hidden" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <section
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="mx-auto mt-4 flex w-full min-w-0 max-w-5xl flex-col gap-4 px-4 sm:px-8 lg:px-4"
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
              <AttendanceList rows={view.attendance} minPct={view.minPct} />
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
