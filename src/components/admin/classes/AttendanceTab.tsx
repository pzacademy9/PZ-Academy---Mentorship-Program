"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { checkinWindow, type WindowOverride } from "@/lib/attendance/rules";
import { filterAttendanceRows } from "@/lib/classes/attendance-search";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import { useMarkToggle } from "@/components/admin/attendance/useMarkToggle";
import {
  markEveryonePresent, setOverride, type ActionResult,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { cardCls, fieldCls, labelCls, quietBtn } from "./styles";

const WINDOW_LABEL = { before: "Not open yet", open: "Open now", closed: "Closed" } as const;

function overrideNote(value: WindowOverride, state: keyof typeof WINDOW_LABEL): string {
  if (value === "open") return "Force open: students can check in at any time, until you change this.";
  if (value === "closed") return "Force closed: nobody can check in, until you change this.";
  const now = state === "open" ? "Right now it is open." : state === "before" ? "Right now it has not opened yet." : "Right now it is closed.";
  return `Automatic: opens 15 minutes before the start and closes 15 minutes after. ${now}`;
}

export function AttendanceTab({
  cls, session, rows, nowIso,
}: {
  cls: ClassSummary;
  session: SessionRow;
  rows: GridRow[];
  nowIso: string;
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
  const state = checkinWindow(session.starts_at, override, now);
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
    <section data-testid="attendance-card" className="space-y-4">
      <div className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-headline text-xl font-bold text-pz-on-surface">Who is here</h3>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-base font-headline font-bold",
              state === "open"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : "bg-pz-surface-container-high text-pz-on-surface-variant",
            )}
          >
            Check-in: {WINDOW_LABEL[state]}
          </span>
        </div>
        <div className="rounded-lg bg-pz-surface-container-low p-4">
          <p className="text-base text-pz-on-surface-variant">
            <span className="font-headline text-3xl font-bold text-pz-on-surface">{cls.presentCount}</span>{" "}
            of {cls.enrolledLive} present
          </p>
          <div className="mt-2 h-2 rounded-full bg-pz-surface-container-high" aria-hidden>
            <div className="h-2 rounded-full bg-pz-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className={`${cardCls} space-y-3`}>
        <div>
          <label htmlFor="attendance-search" className={labelCls}>Search by name or ID</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-pz-on-surface-variant" aria-hidden />
            <input
              id="attendance-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${fieldCls} pl-10`}
            />
          </div>
        </div>
        <p className="text-base text-pz-on-surface-variant">Only live students are listed. Tap a student to mark them present or take it off.</p>

        {rows.length === 0 ? (
          <p className="text-base text-pz-on-surface-variant">No live students in this batch yet.</p>
        ) : shown.length === 0 ? (
          <p className="text-base text-pz-on-surface-variant">No student matches that search.</p>
        ) : (
          <ul data-testid="attendance-list" className="max-h-[60vh] divide-y divide-pz-outline-variant/40 overflow-y-auto rounded-lg border border-pz-outline-variant/60">
            {shown.map((r) => {
              const on = marks.isOn(r, session);
              return (
                <li key={r.personId}>
                  <button
                    type="button"
                    onClick={() => marks.toggle(r, session)}
                    aria-pressed={on}
                    aria-label={`${r.name}, ${on ? "present" : "not marked"}`}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-pz-surface-container-low"
                  >
                    <span
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border",
                        on ? "border-pz-primary bg-pz-primary text-pz-on-primary" : "border-pz-outline-variant text-transparent",
                      )}
                      aria-hidden
                    >
                      <Check className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium text-pz-on-surface">{r.name}</span>
                      <span className="block truncate text-base text-pz-on-surface-variant">{r.pzId}</span>
                    </span>
                    <span className="shrink-0 text-base text-pz-on-surface-variant" aria-hidden>{on ? "Present" : "Not marked"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy || marks.busy || rows.length === 0} onClick={onMarkAll}>
          Mark everyone present
        </button>
      </div>

      <div className={`${cardCls} space-y-2`}>
        <h3 className="font-headline text-lg font-bold text-pz-on-surface">Check-in</h3>
        <div role="group" aria-label="Check-in" className="grid grid-cols-3 gap-1 rounded-lg bg-pz-surface-container-low p-1">
          {([["auto", "Automatic"], ["open", "Force open"], ["closed", "Force closed"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              disabled={busy}
              aria-pressed={override === v}
              onClick={() => run(() => setOverride(session.id, v))}
              className={cn(
                "min-h-12 rounded-md px-2 font-headline text-base font-bold transition-colors disabled:opacity-50",
                override === v ? "bg-pz-primary text-pz-on-primary" : "text-pz-on-surface-variant hover:text-pz-on-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-base text-pz-on-surface-variant">{overrideNote(override, state)}</p>
      </div>
    </section>
  );
}
