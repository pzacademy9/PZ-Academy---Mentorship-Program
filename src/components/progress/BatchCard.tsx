"use client";

import { ChevronDown, CircleCheck, CircleAlert, Info } from "lucide-react";
import type { ProgressBatch } from "@/lib/progress/build";
import { ResultRowItem, SessionRow } from "./SessionRow";
import { btnFocus } from "./ui";

export type ProgressView = "attendance" | "results";

interface Props {
  id: string;
  batch: ProgressBatch;
  view: ProgressView;
  open: boolean;
  onToggle: () => void;
}

export function BatchCard({ id, batch, view, open, onToggle }: Props) {
  const panelId = `${id}-panel`;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl bg-pz-surface-container-lowest shadow-sm ring-1 ring-pz-outline-variant/40">
      <h4 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className={`flex min-h-12 w-full min-w-0 items-center justify-between gap-3 rounded-xl p-4 text-left transition-colors hover:bg-pz-surface-container-low motion-reduce:transition-none ${btnFocus}`}
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 break-words font-headline text-base font-bold text-pz-on-surface">{batch.title}</span>
              {batch.latest && (
                <span className="rounded bg-pz-primary-container px-2 py-0.5 font-headline text-xs font-bold uppercase text-pz-on-primary-container">
                  Latest
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-sm text-pz-on-surface-variant">
              {batch.mode === "live" ? "Live student" : "Recorded student"}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={`h-6 w-6 shrink-0 text-pz-outline transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h4>
      <div id={panelId} hidden={!open} className="flex min-w-0 flex-col gap-4 px-4 pb-4">
        {open && (view === "attendance" ? <AttendanceView batch={batch} /> : <ResultsView batch={batch} />)}
        {/* Room for the certificate line (added in a later build, behind a cached read). */}
      </div>
    </div>
  );
}

function RecordedNote() {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-pz-surface-container-low p-3 text-sm text-pz-on-surface-variant">
      <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-pz-outline" />
      <p className="min-w-0">
        <span className="block font-headline font-semibold text-pz-on-surface">Recorded student</span>
        Attendance is not tracked for recorded students. Your quiz results are in the Quiz Results tab.
      </p>
    </div>
  );
}

function AttendanceView({ batch }: { batch: ProgressBatch }) {
  const a = batch.attendance;
  if (!a) return <RecordedNote />;

  const below = a.pct !== null && !a.meetsMin;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-2 rounded-lg bg-pz-surface-container-low p-3">
        {a.held === 0 ? (
          <p className="font-headline text-sm font-bold text-pz-on-surface">No classes have happened yet.</p>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 font-headline text-sm font-bold text-pz-on-surface">
                Attended {a.attended} of {a.held} {a.held === 1 ? "class" : "classes"} ({a.pct}%)
              </p>
              {a.meetsMin ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-pz-primary px-2.5 py-1 font-headline text-xs font-bold text-pz-on-primary">
                  <CircleCheck aria-hidden className="h-3.5 w-3.5" />
                  Meets {a.minPct}% target
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-pz-secondary-container px-2.5 py-1 font-headline text-xs font-bold text-pz-on-secondary-container">
                  <CircleAlert aria-hidden className="h-3.5 w-3.5" />
                  Below the {a.minPct}% target
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-label="Attendance"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={a.pct ?? 0}
              className="h-2 w-full overflow-hidden rounded-full bg-pz-surface-container-highest"
            >
              <div
                className={`h-2 rounded-full ${below ? "bg-pz-secondary" : "bg-pz-primary"}`}
                style={{ width: `${a.pct ?? 0}%` }}
              />
            </div>
          </>
        )}
        <p className="text-sm text-pz-on-surface-variant">
          {below
            ? `You need at least ${a.minPct}% attendance. Try not to miss the next classes.`
            : `At least ${a.minPct}% attendance is needed.`}
        </p>
      </div>

      {a.rows.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">No classes are listed for you yet.</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <h5 className="font-headline text-xs font-semibold uppercase tracking-wider text-pz-outline">Classes</h5>
          <ul className="flex min-w-0 flex-col gap-2">
            {a.rows.map((r) => (
              <SessionRow key={`${r.number}-${r.startsAt}`} row={r} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ResultsView({ batch }: { batch: ProgressBatch }) {
  const { total, rows } = batch.results;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {batch.mode === "recorded" && <RecordedNote />}
      {rows.length === 0 ? (
        <p className="rounded-lg bg-pz-surface-container-low p-3 text-sm text-pz-on-surface-variant">
          No quiz results yet. They appear here after your quizzes are marked.
        </p>
      ) : (
        <>
          <div className="rounded-lg bg-pz-surface-container-low p-3.5">
            <p className="font-headline text-xl font-black text-pz-on-surface">Total score: {total}</p>
            <p className="text-sm text-pz-on-surface-variant">
              From {rows.length} {rows.length === 1 ? "quiz" : "quizzes"}
              {batch.mode === "recorded" ? ". Ranks are shown for live students only." : "."}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h5 className="font-headline text-xs font-semibold uppercase tracking-wider text-pz-outline">Quizzes</h5>
            <ul className="flex min-w-0 flex-col gap-2">
              {rows.map((r) => (
                <ResultRowItem key={`${r.number}-${r.startsAt}`} row={r} />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
