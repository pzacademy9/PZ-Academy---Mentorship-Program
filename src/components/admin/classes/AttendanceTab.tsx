"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { checkinWindow, effectiveWindow, type WindowMinutes, type WindowOverride } from "@/lib/attendance/rules";
import { filterAttendanceRows } from "@/lib/classes/attendance-search";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import { useMarkToggle } from "@/components/admin/attendance/useMarkToggle";
import {
  markEveryonePresent, setOverride, type ActionResult,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { dsCard, dsField, dsLabel, dsOutline, dsHeading, dsMuted, dsSegOff, dsSegOn, dsSegTrack, dsFocus } from "./ds";

const WINDOW_LABEL = { before: "Not open yet", open: "Open now", closed: "Closed" } as const;

const DEFAULT_WINDOW: WindowMinutes = { open: 15, close: 15 };
const mins = (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`;

function overrideNote(value: WindowOverride, state: keyof typeof WINDOW_LABEL, win: WindowMinutes): string {
  if (value === "open") return "Force open: students can check in at any time, until you change this.";
  if (value === "closed") return "Force closed: nobody can check in, until you change this.";
  const now = state === "open" ? "Right now it is open." : state === "before" ? "Right now it has not opened yet." : "Right now it is closed.";
  return `Automatic: opens ${mins(win.open)} before the start and closes ${mins(win.close)} after. ${now}`;
}

export function AttendanceTab({
  cls, session, rows, nowIso, batchWindow = DEFAULT_WINDOW,
}: {
  cls: ClassSummary;
  session: SessionRow;
  rows: GridRow[];
  nowIso: string;
  batchWindow?: WindowMinutes;
}) {
  const confirm = useConfirm();
  const [busy, startTransition] = useTransition();
  const marks = useMarkToggle();
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const override = session.window_override as WindowOverride;
  const win = effectiveWindow(session, { checkin_open_minutes: batchWindow.open, checkin_close_minutes: batchWindow.close });
  const state = checkinWindow(session.starts_at, override, now, win);
  const missing = rows.filter((r) => !marks.isOn(r, session)).length;
  const pct = cls.enrolledLive > 0 ? Math.min(100, Math.round((cls.presentCount * 100) / cls.enrolledLive)) : 0;
  const shown = filterAttendanceRows(rows, query);

  function run(fn: () => Promise<ActionResult>, after?: () => void) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        after?.();
        if (res.message) toast.success(res.message);
      } else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  async function onMarkAll() {
    const ok = await confirm({
      title: "Mark everyone present?",
      description:
        missing === 0
          ? "Every live student is already marked present for this class."
          : `${missing} ${missing === 1 ? "student" : "students"} will be marked present. Anyone already marked stays as they are.`,
      confirmLabel: "Mark everyone present",
    });
    if (ok) run(() => markEveryonePresent(session.id), () => marks.setAllOn(rows, session));
  }

  return (
    <section data-testid="attendance-card" className="space-y-4 font-poppins">
      <div className={`${dsCard} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={`text-xl ${dsHeading}`}>Who is here</h3>
          <span
            className={cn(
              "rounded-full px-3 py-0.5 font-fredoka text-[15px] font-medium",
              state === "open"
                ? "bg-[#E3F6DA] text-[#0F3D22] dark:bg-emerald-900/40 dark:text-emerald-200"
                : "bg-[#EAF5E4] text-[#4D6B54] dark:bg-pz-surface-container-high dark:text-pz-on-surface-variant",
            )}
          >
            Check-in: {WINDOW_LABEL[state]}
          </span>
        </div>
        <div>
          <p className={`text-base ${dsMuted}`}>
            <span className={`text-3xl ${dsHeading}`}>{cls.presentCount}</span>{" "}
            of {cls.enrolledLive} present
          </p>
          <div className="mt-2 h-2 rounded-full bg-[#EAF5E4] dark:bg-pz-surface-container-high" aria-hidden>
            <div className="h-2 rounded-full bg-[#196432] dark:bg-pz-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className={`${dsCard} space-y-3`}>
        <div>
          <label htmlFor="attendance-search" className={dsLabel}>Search by name or ID</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#4D6B54] dark:text-pz-on-surface-variant" strokeWidth={1.75} aria-hidden />
            <input
              id="attendance-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${dsField} pl-11`}
            />
          </div>
        </div>
        <p className={`text-base ${dsMuted}`}>Only live students are listed. Tap a student to mark them present or take it off.</p>

        {rows.length === 0 ? (
          <p className={`text-base ${dsMuted}`}>No live students in this batch yet.</p>
        ) : shown.length === 0 ? (
          <p className={`text-base ${dsMuted}`}>No student matches that search.</p>
        ) : (
          <ul data-testid="attendance-list" className="max-h-[60vh] divide-y divide-[#D4EACC] overflow-y-auto border-y border-[#D4EACC] dark:divide-pz-outline-variant/40 dark:border-pz-outline-variant/60">
            {shown.map((r) => {
              const on = marks.isOn(r, session);
              return (
                <li key={r.personId}>
                  <button
                    type="button"
                    onClick={() => marks.toggle(r, session)}
                    aria-pressed={on}
                    aria-label={`${r.name}, ${on ? "present" : "not marked"}`}
                    className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[#F7FAF5] dark:hover:bg-pz-surface-container-low ${dsFocus}`}
                  >
                    <span
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border",
                        on ? "border-[#194B32] bg-[#194B32] text-white dark:border-pz-primary dark:bg-pz-primary dark:text-pz-on-primary" : "border-[#D4EACC] text-transparent dark:border-pz-outline-variant",
                      )}
                      aria-hidden
                    >
                      <Check className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-[#1A2E1F] dark:text-pz-on-surface">{r.name}</span>
                      <span className="block truncate font-fredoka text-base text-[#4D6B54] dark:text-pz-on-surface-variant">{r.pzId}</span>
                    </span>
                    <span className="shrink-0 font-fredoka text-[15px] text-[#4D6B54] dark:text-pz-on-surface-variant" aria-hidden>{on ? "Present" : "Not marked"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" className={`${dsOutline} max-md:w-full`} disabled={busy || marks.busy || rows.length === 0} onClick={onMarkAll}>
          Mark everyone present
        </button>
      </div>

      <div className={`${dsCard} space-y-2`}>
        <h3 className={`text-lg ${dsHeading}`}>Check-in</h3>
        <div role="group" aria-label="Check-in" className={`grid grid-cols-3 gap-1 ${dsSegTrack}`}>
          {([["auto", "Automatic"], ["open", "Force open"], ["closed", "Force closed"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              disabled={busy}
              aria-pressed={override === v}
              onClick={() => run(() => setOverride(session.id, v))}
              className={cn(
                "min-h-12 rounded-full px-2 font-poppins text-base font-semibold transition-colors disabled:opacity-50",
                dsFocus,
                override === v ? dsSegOn : dsSegOff,
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={`text-base ${dsMuted}`}>{overrideNote(override, state, win)}</p>
      </div>
    </section>
  );
}
