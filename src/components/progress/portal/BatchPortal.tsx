"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, FlaskConical, Info, Presentation, Search, Users } from "lucide-react";
import { coverProxyUrl } from "@/lib/feedback/cover-url";
import type { PortalBatchView } from "@/lib/progress/portal-build";
import { btnFocus, inputClass } from "../ui";
import { AttendanceList } from "./AttendanceList";
import { ResultsBoard, resultRowsFor } from "./ResultsBoard";

const KIND_ICON = { course: BookOpen, workshop: FlaskConical, webinar: Presentation } as const;
const STATE_CHIP = {
  live: { text: "Live", cls: "bg-pz-primary-container text-pz-on-primary-container" },
  completed: { text: "Completed", cls: "bg-pz-secondary-fixed text-pz-on-secondary-fixed" },
  recorded: { text: "Recorded", cls: "bg-pz-surface-container-high text-pz-on-surface-variant" },
} as const;

/** Lower-case and drop spaces so "sample 0001" and "Sample-0001" style typing both work. */
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");

type Tab = "attendance" | "results";

export function BatchPortal({ view }: { view: PortalBatchView }) {
  const [tab, setTab] = useState<Tab>("attendance");
  const [term, setTerm] = useState("");
  const [pick, setPick] = useState("overall");

  const needle = squash(term);
  const matches = (r: { name: string; pzId: string }) =>
    needle === "" || squash(r.name).includes(needle) || squash(r.pzId).includes(needle);

  const attendance = view.attendance.filter(matches);
  const resultTotal = resultRowsFor(view, pick);
  const results = resultTotal.filter(matches);

  const shown = tab === "attendance" ? attendance.length : results.length;
  const total = tab === "attendance" ? view.attendance.length : resultTotal.length;
  const Icon = KIND_ICON[view.kind];
  const chip = STATE_CHIP[view.state];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <Link href="/progress" className={`flex min-h-11 w-fit items-center gap-2 rounded-lg font-headline text-base font-bold text-pz-primary ${btnFocus}`}>
        <ArrowLeft aria-hidden className="h-5 w-5" />
        Back to all batches
      </Link>

      <header className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-pz-surface-container-lowest shadow-sm ring-1 ring-pz-outline-variant/40 md:flex-row">
        {view.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Drive covers go through /api/cover; fixed aspect box prevents layout shift
          <img
            src={coverProxyUrl(view.coverUrl)}
            alt=""
            width={640}
            height={360}
            decoding="async"
            className="aspect-video w-full bg-pz-surface-container-high object-cover md:w-64 md:shrink-0"
          />
        ) : (
          <div
            data-cover-placeholder
            aria-hidden
            className="flex aspect-video w-full items-center justify-center bg-pz-primary-container text-pz-on-primary-container md:w-64 md:shrink-0"
          >
            <Icon className="h-10 w-10 opacity-70" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <span className={`w-fit rounded-full px-2.5 py-1 font-headline text-sm font-bold ${chip.cls}`}>{chip.text}</span>
          <h1 className="min-w-0 break-words font-headline text-2xl font-black leading-tight tracking-tight text-pz-on-surface sm:text-3xl">{view.title}</h1>
          <div className="flex min-w-0 flex-wrap gap-2 text-sm text-pz-on-surface-variant">
            <span className="rounded-md bg-pz-surface-container-high px-2.5 py-1">
              {view.classesHeld} {view.classesHeld === 1 ? "class" : "classes"} held
            </span>
            <span className="flex items-center gap-1.5 rounded-md bg-pz-surface-container-high px-2.5 py-1">
              <Users aria-hidden className="h-4 w-4" />
              {view.students} {view.students === 1 ? "student" : "students"}
            </span>
          </div>
        </div>
      </header>

      <div className="relative min-w-0">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-pz-outline" />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search by name or PZ ID"
          placeholder="Search by name or PZ ID"
          className={`${inputClass} pl-11`}
        />
      </div>
      <p role="status" aria-live="polite" className="-mt-2 text-sm text-pz-on-surface-variant">
        Showing {shown} of {total}
      </p>

      <div role="tablist" aria-label="Batch lists" className="flex min-w-0 gap-1 rounded-xl bg-pz-surface-container-high p-1">
        {(["attendance", "results"] as const).map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-lg px-3 font-headline text-sm font-bold transition-colors motion-reduce:transition-none ${btnFocus} ${
              tab === t ? "bg-pz-surface-container-lowest text-pz-primary shadow-sm" : "text-pz-on-surface-variant hover:bg-pz-surface-variant"
            }`}
          >
            {t === "attendance" ? "Attendance" : "Results"}
          </button>
        ))}
      </div>

      <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="flex min-w-0 flex-col gap-4">
        {tab === "attendance" ? (
          <>
            <p className="flex min-w-0 items-start gap-2 rounded-xl bg-pz-tertiary-container px-3.5 py-2.5 text-sm text-pz-on-tertiary-container">
              <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Minimum attendance: {view.minPct}%</span>
            </p>
            {view.attendance.length === 0 ? (
              <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No students yet</p>
            ) : attendance.length === 0 ? (
              <p className="rounded-xl bg-pz-surface-container-low p-4 text-base text-pz-on-surface-variant">No one matches</p>
            ) : (
              <AttendanceList rows={attendance} minPct={view.minPct} />
            )}
          </>
        ) : (
          <ResultsBoard view={view} pick={pick} onPick={setPick} rows={results} totalRows={resultTotal.length} />
        )}
      </section>
    </div>
  );
}
