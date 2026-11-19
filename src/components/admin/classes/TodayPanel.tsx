"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, FileUp, Pencil, Video } from "lucide-react";
import { formatPkt, isoToPktInput } from "@/lib/attendance/rules";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { AttendanceCard } from "./AttendanceCard";
import { ClassActionRow } from "./ClassActionRow";
import { QuizCard } from "./QuizCard";
import { ClassTabs } from "./ClassTabs";
import { LinksTab } from "./LinksTab";
import { EditClassDialog } from "./EditClassDialog";
import { attendanceStatus, nextAction, quizStatus } from "@/lib/classes/card-status";
import { CLASS_TABS, classPanelId, classTabId, type ClassTab } from "@/lib/classes/tabs";
import { cardCls, primaryBtn, quietBtn } from "./styles";

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
  pageId, cls, session, rows, minPct, sends, nowIso, tab, onTabChange, onNeedAudience,
}: {
  pageId: string;
  cls: ClassSummary;
  session: SessionRow;
  rows: GridRow[];
  minPct: number;
  sends: SessionSendState | undefined;
  nowIso: string;
  tab: ClassTab;
  onTabChange: (t: ClassTab) => void;
  /** Called when Send emails is pressed before an audience is chosen. Defaults to switching to the Links tab, then focusing the audience box. */
  onNeedAudience?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const needAudience =
    onNeedAudience ??
    (() => {
      onTabChange("links");
      // Wait for the Links tab to show, then bring the audience box into view and focus its first choice.
      // The tab may take a frame or two to mount, so look again for a few frames before giving up.
      let frames = 0;
      const look = () => {
        const box = document.getElementById("class-audience");
        if (!box) {
          if (++frames < 5) requestAnimationFrame(look);
          return;
        }
        box.scrollIntoView?.({ behavior: "smooth", block: "center" });
        box.querySelector<HTMLElement>("[role='radio']")?.focus();
      };
      requestAnimationFrame(look);
    });
  const step = nextStep(cls);
  const action = nextAction(cls);
  const quizHref = `/dashboard/admin/enrollments/registrations/campaign/${pageId}/sessions/${cls.id}/quiz`;
  function runAction() {
    // The attendance link and the feedback link both live on the Links tab.
    if (action.target === null || action.target === "quiz") return;
    onTabChange("links");
    requestAnimationFrame(() => {
      const panelEl = document.getElementById(classPanelId("links"));
      panelEl?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      panelEl?.focus();
    });
  }
  const counts: Partial<Record<ClassTab, string>> = {
    attendance: attendanceStatus(cls).line,
    quiz: quizStatus(cls).line,
  };

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
        <ClassActionRow cls={cls} session={session} sends={sends} now={new Date(nowIso)} onNeedAudience={needAudience} />
        <div role="status" aria-label="Next step" className="rounded-lg border border-pz-primary/40 bg-pz-primary/10 p-4">
          <p className="font-headline text-lg font-bold text-pz-on-surface">Next step: {step.title}</p>
          <p className="text-base text-pz-on-surface-variant">{step.hint}</p>
          {action.target === "quiz" && (
            <Link href={quizHref} className={`${primaryBtn} mt-3 w-full`}>
              <FileUp className="size-5" aria-hidden />
              {action.label}
            </Link>
          )}
          {action.target !== null && action.target !== "quiz" && (
            <button type="button" className={`${primaryBtn} mt-3 w-full`} onClick={runAction}>
              {action.label}
            </button>
          )}
        </div>
      </section>

      <ClassTabs active={tab} onChange={onTabChange} counts={counts} panelId={classPanelId} />
      {CLASS_TABS.map((t) => (
        // All three panels exist so each tab's aria-controls points at something; only the open one has content.
        <div
          key={t}
          role="tabpanel"
          id={classPanelId(t)}
          aria-labelledby={classTabId(t)}
          tabIndex={-1}
          hidden={t !== tab}
          className="scroll-mt-32 outline-none"
        >
          {t === tab && t === "links" && <LinksTab pageId={pageId} cls={cls} session={session} sends={sends} />}
          {t === tab && t === "attendance" && <AttendanceCard pageId={pageId} cls={cls} session={session} rows={rows} minPct={minPct} sends={sends} nowIso={nowIso} />}
          {t === tab && t === "quiz" && <QuizCard pageId={pageId} cls={cls} />}
        </div>
      ))}

      {editing && <EditClassDialog pageId={pageId} session={session} nextNumber={cls.number} sends={sends} onClose={() => setEditing(false)} />}
    </div>
  );
}
