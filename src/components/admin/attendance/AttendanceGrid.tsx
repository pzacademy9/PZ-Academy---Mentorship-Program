"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { summarizeAttendance } from "@/lib/classes/summary";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import { saveMinPct, toggleMark } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

const quietBtn =
  "inline-flex items-center justify-center gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg font-headline text-xs font-medium bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container-high hover:text-pz-on-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function AttendanceGrid({
  pageId, sessions, rows, minPct, scoped = false,
}: {
  pageId: string;
  sessions: SessionRow[];
  rows: GridRow[];
  minPct: number;
  /** One class only: no heading or minimum field, and no whole-batch percentage columns. */
  scoped?: boolean;
}) {
  const [min, setMin] = useState(String(minPct));
  const [busy, startTransition] = useTransition();
  // Cells flip at once and are put back if the save fails.
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const key = (personId: string, sessionId: string) => `${personId}|${sessionId}`;

  function cell(r: GridRow, s: SessionRow): boolean {
    const k = key(r.personId, s.id);
    return k in flipped ? flipped[k] : !!r.marks[s.id];
  }

  function toggle(r: GridRow, s: SessionRow) {
    const k = key(r.personId, s.id);
    const next = !cell(r, s);
    setFlipped((p) => ({ ...p, [k]: next }));
    startTransition(async () => {
      const res = await toggleMark(s.id, r.personId, next);
      if (!res.ok) {
        toast.error(res.message ?? "Something went wrong. Please try again.");
        setFlipped((p) => ({ ...p, [k]: !next }));
      }
    });
  }

  function saveMin() {
    startTransition(async () => {
      const res = await saveMinPct(pageId, Number(min));
      if (res.ok) toast.success(res.message ?? "Saved");
      else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  const summary = summarizeAttendance(rows, minPct);

  return (
    <section className="space-y-3">
      {!scoped && <h2 className="font-headline text-lg font-bold text-pz-on-surface">Attendance</h2>}
      {!scoped && <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="min-pct" className="block text-xs font-headline font-bold text-pz-on-surface-variant mb-1">
            Minimum attendance to pass (%)
          </label>
          <input
            id="min-pct" type="number" min={0} max={100} value={min} onChange={(e) => setMin(e.target.value)}
            className="w-24 rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2 max-md:min-h-11 text-sm text-pz-on-surface"
          />
        </div>
        <button type="button" className={quietBtn} onClick={saveMin} disabled={busy}>Save minimum</button>
      </div>}
      {!scoped && summary.averagePct !== null && (
        <p className="text-sm font-medium text-pz-on-surface">
          Batch average {summary.averagePct}%. {summary.meetingMin} of {summary.total} meet the minimum.
        </p>
      )}
      <p className={cn("text-pz-on-surface-variant", scoped ? "text-base" : "text-xs")}>
        {scoped
          ? "Only live students are listed. Tap a box to mark a student present or take it off."
          : "Only live students are listed. Click a box to mark a student present or take it off. The percentage counts sessions that have already started."}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">No live students in this batch yet.</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-pz-on-surface-variant">Add a class to start taking attendance.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-pz-outline-variant/60">
          <table className="w-full text-sm">
            <thead className="bg-pz-surface-container-low text-left text-xs font-headline font-bold text-pz-on-surface-variant">
              <tr>
                <th className="px-3 py-2">Student</th>
                {sessions.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-center" title={s.title || `Session ${s.number}`}>S{s.number}</th>
                ))}
                {!scoped && <th className="px-3 py-2 text-right">Attended</th>}
                {!scoped && <th className="px-3 py-2 text-center">Meets minimum</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.personId} className="border-t border-pz-outline-variant/40">
                  <td className="px-3 py-2">
                    <span className="font-medium text-pz-on-surface">{r.name}</span>
                    <span className="ml-2 text-xs text-pz-on-surface-variant">{r.pzId}</span>
                  </td>
                  {sessions.map((s) => {
                    const on = cell(r, s);
                    return (
                      <td key={s.id} className="px-1 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(r, s)}
                          aria-pressed={on}
                          aria-label={`${r.name}, session ${s.number}: ${on ? "present" : "not marked"}`}
                          className={cn(
                            "inline-flex size-8 max-md:size-11 items-center justify-center rounded-md border transition-colors",
                            on
                              ? "border-pz-primary bg-pz-primary text-pz-on-primary"
                              : "border-pz-outline-variant text-transparent hover:border-pz-primary",
                          )}
                        >
                          <Check className="size-4" />
                        </button>
                      </td>
                    );
                  })}
                  {!scoped && <td className="px-3 py-2 text-right tabular-nums">
                    {r.pct === null ? "No session yet" : `${r.pct}% (${r.marked} of ${r.started})`}
                  </td>}
                  {!scoped && <td className="px-3 py-2 text-center">
                    {r.pct === null ? "" : r.meetsMin ? (
                      <span className="text-emerald-700 dark:text-emerald-300 font-bold">Yes</span>
                    ) : (
                      <span className="text-pz-on-surface-variant">No</span>
                    )}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
