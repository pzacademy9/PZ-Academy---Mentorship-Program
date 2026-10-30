"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { checkinWindow, type WindowOverride } from "@/lib/attendance/rules";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { AttendanceGrid } from "@/components/admin/attendance/AttendanceGrid";
import {
  emailUpdatedTime, markEveryonePresent, resendClassDetails, sendReminderNow, setOverride, type ActionResult,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { CopyLinkButton, LinkBox } from "./CopyLinkButton";
import { AudiencePicker } from "./AudiencePicker";
import { emailStatusLine } from "./email-status";
import { cardCls, quietBtn } from "./styles";

const WINDOW_LABEL = { before: "Not open yet", open: "Open now", closed: "Closed" } as const;

function overrideNote(value: WindowOverride, state: keyof typeof WINDOW_LABEL): string {
  if (value === "open") return "Force open: students can check in at any time, until you change this.";
  if (value === "closed") return "Force closed: nobody can check in, until you change this.";
  const now = state === "open" ? "Right now it is open." : state === "before" ? "Right now it has not opened yet." : "Right now it is closed.";
  return `Automatic: opens 15 minutes before the start and closes 15 minutes after. ${now}`;
}

export function AttendanceCard({
  pageId, cls, session, rows, minPct, sends, nowIso,
}: {
  pageId: string;
  cls: ClassSummary;
  session: SessionRow;
  rows: GridRow[];
  minPct: number;
  sends: SessionSendState | undefined;
  nowIso: string;
}) {
  const confirm = useConfirm();
  const [busy, startTransition] = useTransition();
  const override = session.window_override as WindowOverride;
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const state = checkinWindow(session.starts_at, override, now);
  const missing = rows.filter((r) => !r.marks[session.id]).length;
  const pct = cls.enrolledLive > 0 ? Math.min(100, Math.round((cls.presentCount * 100) / cls.enrolledLive)) : 0;

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
      } else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  async function onEmail() {
    if (!sends?.reminderAt) {
      run(() => sendReminderNow(session.id));
      return;
    }
    const ok = await confirm({
      title: "Email students again?",
      description: "Send the class details again to all enrolled students?",
      confirmLabel: "Email to students",
    });
    if (ok) run(() => resendClassDetails(session.id));
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
    if (ok) run(() => markEveryonePresent(session.id));
  }

  return (
    <section data-testid="attendance-card" className={`${cardCls} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-headline text-xl font-bold text-pz-on-surface">Attendance</h3>
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
      <p className="text-base text-pz-on-surface-variant">Share this link so students can mark themselves present.</p>
      <p className="text-base text-pz-on-surface-variant">{emailStatusLine(session, sends)}</p>
      <LinkBox url={cls.attendanceLink} />
      <div className="flex flex-col gap-2 md:flex-row">
        <CopyLinkButton url={cls.attendanceLink} />
        <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={onEmail}>
          <Mail className="size-5" aria-hidden />
          Email to students
        </button>
      </div>
      <AudiencePicker pageId={pageId} sessionId={session.id} saved={session.audience} />

      <div className="rounded-lg bg-pz-surface-container-low p-4">
        <p className="text-base text-pz-on-surface-variant">
          <span className="font-headline text-3xl font-bold text-pz-on-surface">{cls.presentCount}</span>{" "}
          of {cls.enrolledLive} present
        </p>
        <div className="mt-2 h-2 rounded-full bg-pz-surface-container-high" aria-hidden>
          <div className="h-2 rounded-full bg-pz-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <details className="rounded-lg border border-pz-outline-variant/60">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 font-headline text-base font-bold text-pz-on-surface">
          <UserCheck className="size-5" aria-hidden />
          Attendance list
        </summary>
        <div className="space-y-3 p-4">
          <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={onMarkAll}>
            Mark everyone present
          </button>
          <AttendanceGrid pageId={pageId} sessions={[session]} rows={rows} minPct={minPct} scoped />
        </div>
      </details>

      <details className="rounded-lg border border-pz-outline-variant/60">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-headline text-base font-bold text-pz-on-surface">
          More settings
        </summary>
        <div className="space-y-2 p-4">
          <p className="font-headline text-base font-bold text-pz-on-surface-variant">Check-in</p>
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
          <p className="pt-2 font-headline text-base font-bold text-pz-on-surface-variant">Time change email</p>
          <p className="text-base text-pz-on-surface-variant">Use this after you change the class time, to tell students the new time.</p>
          <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={() => run(() => emailUpdatedTime(session.id))}>
            Email updated time
          </button>
        </div>
      </details>
    </section>
  );
}
