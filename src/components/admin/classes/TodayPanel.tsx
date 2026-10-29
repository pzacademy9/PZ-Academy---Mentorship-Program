"use client";

import { useState } from "react";
import { CalendarClock, Pencil, Video } from "lucide-react";
import { formatPkt, isoToPktInput } from "@/lib/attendance/rules";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { AttendanceCard } from "./AttendanceCard";
import { QuizCard } from "./QuizCard";
import { FeedbackCard } from "./FeedbackCard";
import { EditClassDialog } from "./EditClassDialog";
import { cardCls, quietBtn } from "./styles";

/** The single next step for a class. */
export function nextStep(c: ClassSummary): { title: string; hint: string } {
  if (c.status === "upcoming") {
    return { title: "Share the attendance link with students", hint: "Copy the link below and post it in the students' group." };
  }
  if (!c.quiz.saved) {
    return {
      title: c.status === "today" ? "Upload today's quiz results" : "Upload this class's quiz results",
      hint: "Download the report from Kahoot and upload it in the Quiz results card.",
    };
  }
  if (!c.feedbackLink) {
    return { title: "Create the feedback link for this class", hint: "Use Create missing feedback links in the Feedback card." };
  }
  if (c.feedbackCount === 0) {
    return { title: "Check feedback responses", hint: "No student has answered the feedback form yet." };
  }
  return { title: "All done for this class", hint: "Attendance, quiz results and feedback are all in." };
}

const STATUS_LABEL = { done: "Done", today: "Today", upcoming: "Upcoming" } as const;

function clock(iso: string): string {
  const [h, m] = isoToPktInput(iso).slice(11, 16).split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function TodayPanel({
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
  const [editing, setEditing] = useState(false);
  const step = nextStep(cls);
  return (
    <div className="space-y-4">
      <section className={`${cardCls} space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="rounded-full bg-pz-surface-container-high px-3 py-1 text-base font-headline font-bold text-pz-on-surface-variant">
              Day {cls.number} · {STATUS_LABEL[cls.status]}
            </span>
            <h2 className="mt-2 font-headline text-2xl font-bold text-pz-on-surface">{cls.title || `Day ${cls.number}`}</h2>
          </div>
          <button type="button" className={`${quietBtn} max-md:w-full`} onClick={() => setEditing(true)}>
            <Pencil className="size-5" aria-hidden />
            Edit this class
          </button>
        </div>
        <p className="flex items-center gap-2 text-base text-pz-on-surface-variant">
          <CalendarClock className="size-5 shrink-0" aria-hidden />
          {formatPkt(cls.startsAt)}
          {cls.endsAt ? ` to ${clock(cls.endsAt)}` : ""}
        </p>
        {cls.speaker && <p className="text-base text-pz-on-surface-variant">Speaker: {cls.speaker}</p>}
        {session.zoom_url && (
          <a
            href={session.zoom_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 text-base font-headline font-bold text-pz-primary"
          >
            <Video className="size-5" aria-hidden />
            Open Zoom link
          </a>
        )}
        <div role="status" className="rounded-lg border border-pz-primary/40 bg-pz-primary/10 p-4">
          <p className="font-headline text-lg font-bold text-pz-on-surface">Next step: {step.title}</p>
          <p className="text-base text-pz-on-surface-variant">{step.hint}</p>
        </div>
      </section>

      <AttendanceCard pageId={pageId} cls={cls} session={session} rows={rows} minPct={minPct} sends={sends} nowIso={nowIso} />
      <QuizCard pageId={pageId} cls={cls} />
      <FeedbackCard pageId={pageId} cls={cls} />

      {editing && <EditClassDialog pageId={pageId} session={session} nextNumber={cls.number} sends={sends} onClose={() => setEditing(false)} />}
    </div>
  );
}
