"use client";

import { useState, useTransition } from "react";
import { useTickingNow } from "./useTickingNow";
import Link from "next/link";
import { toast } from "sonner";
import { FlaskConical, Mail, MessageSquareText, Star } from "lucide-react";
import { effectiveWindow, formatPkt, type WindowMinutes } from "@/lib/attendance/rules";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { attendanceMessage, feedbackMessage } from "@/lib/classes/share-messages";
import { emailFeedbackLink } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { createMissingFeedbackAction } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";
import { AudiencePicker } from "./AudiencePicker";
import { ClassEmailHistory } from "./ClassEmailHistory";
import { CopyLinkMenu } from "./CopyLinkMenu";
import { emailStatusLine, reminderSendIso } from "./email-status";
import { useSessionEmails } from "./useSessionEmails";
import { dsCard, dsDivider, dsForest, dsHeading, dsMuted, dsOutline, dsWell, dsFocus } from "./ds";

function LinkCard({ title, hint, url, message }: { title: string; hint: string; url: string; message: string }) {
  return (
    <div role="group" aria-label={title} className={`min-w-0 space-y-2 ${dsCard}`}>
      <h3 className={`text-lg ${dsHeading}`}>{title}</h3>
      <div className={`flex items-center gap-2 pl-3 ${dsWell}`}>
        <code className="min-w-0 flex-1 truncate text-base text-[#4D6B54] dark:text-pz-on-surface-variant">{url}</code>
        <CopyLinkMenu
          label="Copy link"
          link={url}
          message={message}
          variant="icon"
          className={`inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 font-poppins text-base font-semibold text-[#196432] hover:bg-[#EAF5E4] dark:text-pz-primary dark:hover:bg-pz-surface-container-high ${dsFocus}`}
        />
      </div>
      <p className={`text-base ${dsMuted}`}>{hint}</p>
    </div>
  );
}

export function LinksTab({
  pageId, cls, session, sends, batchTitle, batchWindow = { open: 15, close: 15 },
}: {
  pageId: string;
  cls: ClassSummary;
  session: SessionRow;
  sends: SessionSendState | undefined;
  batchTitle: string;
  batchWindow?: WindowMinutes;
}) {
  const win = effectiveWindow(session, { checkin_open_minutes: batchWindow.open, checkin_close_minutes: batchWindow.close });
  const confirm = useConfirm();
  const emails = useSessionEmails(session, sends);
  const [fbBusy, startFeedback] = useTransition();
  const [fbSent, setFbSent] = useState(0);
  const busy = emails.busy || fbBusy;
  const now = useTickingNow();
  const sendIso = reminderSendIso(session, now);
  const reminderNote = sendIso && !sends?.reminderAt && !sends?.updateAt ? `Reminder set for ${formatPkt(sendIso)}. Nothing sent yet.` : null;

  async function emailFeedback() {
    const ok = await confirm({
      title: "Email the feedback link?",
      description: "Send the feedback link by email to all enrolled students?",
      confirmLabel: "Email to students",
    });
    if (!ok) return;
    startFeedback(async () => {
      const res = await emailFeedbackLink(cls.id);
      if (res.ok) toast.success(res.message ?? "Email sent");
      else toast.error(res.message ?? "Something went wrong. Please try again.");
      setFbSent((n) => n + 1);
    });
  }

  function createFeedback() {
    startFeedback(async () => {
      const res = await createMissingFeedbackAction(pageId);
      if (res.ok) toast.success(res.message ?? "Done");
      else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  return (
    <div className="space-y-4 font-poppins">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <LinkCard title="Attendance link" hint="Share this link so students can mark themselves present." url={cls.attendanceLink} message={attendanceMessage({ batchTitle, link: cls.attendanceLink, startsAtIso: cls.startsAt, openMinutes: win.open, closeMinutes: win.close })} />
        {cls.feedbackLink && cls.feedbackSessionId ? (
          <LinkCard title="Feedback link" hint="Share this link at the end of class so students can rate it." url={cls.feedbackLink} message={feedbackMessage({ batchTitle, link: cls.feedbackLink, classNumber: cls.number })} />
        ) : (
          <div role="group" aria-label="Feedback link" className={`min-w-0 space-y-2 ${dsCard}`}>
            <h3 className={`text-lg ${dsHeading}`}>Feedback link</h3>
            <p className={`text-base ${dsMuted}`}>This class has no feedback link yet.</p>
            <button type="button" className={`${dsForest} max-md:w-full`} disabled={busy} onClick={createFeedback}>
              Create missing feedback links
            </button>
          </div>
        )}
      </div>

      <div id="class-audience" className={dsCard}>
        <h3 className={`mb-3 text-lg ${dsHeading}`}>Who gets this email</h3>
        <AudiencePicker pageId={pageId} sessionId={session.id} saved={session.audience} />
      </div>

      <section className={`${dsCard} space-y-3`}>
        <h3 className={`text-lg ${dsHeading}`}>Who got the emails</h3>
        <p className={`text-base ${dsMuted}`}>{emailStatusLine(session, sends, now)}</p>
        <ClassEmailHistory pageId={pageId} sessionId={session.id} kinds={["reminder", "update"]} refreshKey={`${sends?.reminderAt ?? ""}|${sends?.updateAt ?? ""}`} reminderNote={reminderNote} />
      </section>

      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <button type="button" className={`${dsOutline} max-md:w-full`} disabled={busy} onClick={emails.testToMe}>
          <FlaskConical className="size-5" strokeWidth={1.75} aria-hidden />
          Send me a test
        </button>
        <button type="button" className={`${dsForest} max-md:w-full`} disabled={busy} onClick={emails.missingOnly}>
          <Mail className="size-5" strokeWidth={1.75} aria-hidden />
          Email only those who haven&apos;t got it
        </button>
      </div>

      <details className="rounded-3xl border border-[#D4EACC] bg-white dark:border-pz-outline-variant/60 dark:bg-pz-surface-container-lowest">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-poppins text-base font-semibold text-[#1A2E1F] dark:text-pz-on-surface">
          Zoom link or class time changed
        </summary>
        <div className="space-y-2 p-4">
          <p className={`text-base ${dsMuted}`}>Save the new Zoom link first (Edit this class), then use this to tell everyone.</p>
          <button type="button" className={`${dsOutline} max-md:w-full`} disabled={busy} onClick={emails.newZoomLink}>
            Email new Zoom link
          </button>
          <p className={`pt-2 text-base ${dsMuted}`}>Use this after you change the class time, to tell students the new time.</p>
          <button type="button" className={`${dsOutline} max-md:w-full`} disabled={busy} onClick={emails.updatedTime}>
            Email updated time
          </button>
        </div>
      </details>

      {cls.feedbackLink && cls.feedbackSessionId && (
        <section data-testid="feedback-card" className={`${dsCard} space-y-3`}>
          <h3 className={`text-lg ${dsHeading}`}>Feedback</h3>
          <div className={`pb-3 ${dsDivider}`}>
            <p className={`pt-3 text-2xl ${dsHeading}`}>
              {cls.feedbackCount} {cls.feedbackCount === 1 ? "response" : "responses"}
            </p>
            {cls.feedbackAvg !== null && (
              <p className={`mt-1 flex items-center gap-1.5 text-base ${dsMuted}`}>
                <Star className="size-5 fill-[#7ED957] text-[#196432] dark:fill-amber-400 dark:text-amber-500" strokeWidth={1.75} aria-hidden />
                {cls.feedbackAvg.toFixed(1)} out of 5 on average
              </p>
            )}
          </div>
          <ClassEmailHistory pageId={pageId} sessionId={cls.id} kinds={["feedback"]} refreshKey={fbSent} />
          <div className="flex flex-col gap-2 md:flex-row">
            <button type="button" className={`${dsForest} max-md:w-full`} disabled={busy} onClick={emailFeedback}>
              <Mail className="size-5" strokeWidth={1.75} aria-hidden />
              Email to students
            </button>
            <Link href={`/dashboard/admin/feedback/${cls.feedbackSessionId}`} className={`${dsOutline} max-md:w-full`}>
              <MessageSquareText className="size-5" strokeWidth={1.75} aria-hidden />
              See responses
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
