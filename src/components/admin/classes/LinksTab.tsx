"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, FlaskConical, Mail, MessageSquareText, Star } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { emailFeedbackLink } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { createMissingFeedbackAction } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/setup-actions";
import { AudiencePicker } from "./AudiencePicker";
import { ClassEmailHistory } from "./ClassEmailHistory";
import { emailStatusLine } from "./email-status";
import { useSessionEmails } from "./useSessionEmails";
import { cardCls, primaryBtn, quietBtn } from "./styles";

function LinkCard({ title, hint, url }: { title: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }
  return (
    <div role="group" aria-label={title} className="space-y-2 rounded-xl border border-pz-outline-variant/60 bg-pz-surface-container-lowest p-4">
      <h3 className="font-headline text-lg font-bold text-pz-on-surface">{title}</h3>
      <div className="flex items-center gap-2 rounded-lg border border-pz-outline-variant/60 bg-pz-surface-container-low pl-3">
        <code className="min-w-0 flex-1 truncate text-base text-pz-on-surface-variant">{url}</code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 font-headline text-base font-bold text-pz-primary hover:bg-pz-surface-container-high"
        >
          {copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
          <span className="sr-only md:not-sr-only">{copied ? "Copied" : "Copy link"}</span>
        </button>
      </div>
      <p className="text-base text-pz-on-surface-variant">{hint}</p>
    </div>
  );
}

export function LinksTab({
  pageId, cls, session, sends,
}: {
  pageId: string;
  cls: ClassSummary;
  session: SessionRow;
  sends: SessionSendState | undefined;
}) {
  const confirm = useConfirm();
  const emails = useSessionEmails(session, sends);
  const [fbBusy, startFeedback] = useTransition();
  const [fbSent, setFbSent] = useState(0);
  const busy = emails.busy || fbBusy;

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
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <LinkCard title="Attendance link" hint="Share this link so students can mark themselves present." url={cls.attendanceLink} />
        {cls.feedbackLink && cls.feedbackSessionId ? (
          <LinkCard title="Feedback link" hint="Share this link at the end of class so students can rate it." url={cls.feedbackLink} />
        ) : (
          <div role="group" aria-label="Feedback link" className="space-y-2 rounded-xl border border-pz-outline-variant/60 bg-pz-surface-container-lowest p-4">
            <h3 className="font-headline text-lg font-bold text-pz-on-surface">Feedback link</h3>
            <p className="text-base text-pz-on-surface-variant">This class has no feedback link yet.</p>
            <button type="button" className={`${primaryBtn} max-md:w-full`} disabled={busy} onClick={createFeedback}>
              Create missing feedback links
            </button>
          </div>
        )}
      </div>

      <div id="class-audience" className={cardCls}>
        <h3 className="mb-3 font-headline text-lg font-bold text-pz-on-surface">Who gets this email</h3>
        <AudiencePicker pageId={pageId} sessionId={session.id} saved={session.audience} />
      </div>

      <section className={`${cardCls} space-y-3`}>
        <h3 className="font-headline text-lg font-bold text-pz-on-surface">Who got the emails</h3>
        <p className="text-base text-pz-on-surface-variant">{emailStatusLine(session, sends)}</p>
        <ClassEmailHistory pageId={pageId} sessionId={session.id} kinds={["reminder", "update"]} refreshKey={`${sends?.reminderAt ?? ""}|${sends?.updateAt ?? ""}`} />
      </section>

      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={emails.testToMe}>
          <FlaskConical className="size-5" aria-hidden />
          Send me a test
        </button>
        <button type="button" className={`${primaryBtn} max-md:w-full`} disabled={busy} onClick={emails.missingOnly}>
          <Mail className="size-5" aria-hidden />
          Email only those who haven&apos;t got it
        </button>
      </div>

      <details className="rounded-lg border border-pz-outline-variant/60">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-headline text-base font-bold text-pz-on-surface">
          Zoom link or class time changed
        </summary>
        <div className="space-y-2 p-4">
          <p className="text-base text-pz-on-surface-variant">Save the new Zoom link first (Edit this class), then use this to tell everyone.</p>
          <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={emails.newZoomLink}>
            Email new Zoom link
          </button>
          <p className="pt-2 text-base text-pz-on-surface-variant">Use this after you change the class time, to tell students the new time.</p>
          <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={emails.updatedTime}>
            Email updated time
          </button>
        </div>
      </details>

      {cls.feedbackLink && cls.feedbackSessionId && (
        <section data-testid="feedback-card" className={`${cardCls} space-y-3`}>
          <h3 className="font-headline text-lg font-bold text-pz-on-surface">Feedback</h3>
          <div className="rounded-lg bg-pz-surface-container-low p-4">
            <p className="font-headline text-2xl font-bold text-pz-on-surface">
              {cls.feedbackCount} {cls.feedbackCount === 1 ? "response" : "responses"}
            </p>
            {cls.feedbackAvg !== null && (
              <p className="mt-1 flex items-center gap-1.5 text-base text-pz-on-surface-variant">
                <Star className="size-5 fill-amber-400 text-amber-500" aria-hidden />
                {cls.feedbackAvg.toFixed(1)} out of 5 on average
              </p>
            )}
          </div>
          <ClassEmailHistory pageId={pageId} sessionId={cls.id} kinds={["feedback"]} refreshKey={fbSent} />
          <div className="flex flex-col gap-2 md:flex-row">
            <button type="button" className={`${quietBtn} max-md:w-full`} disabled={busy} onClick={emailFeedback}>
              <Mail className="size-5" aria-hidden />
              Email to students
            </button>
            <Link href={`/dashboard/admin/feedback/${cls.feedbackSessionId}`} className={`${quietBtn} max-md:w-full`}>
              <MessageSquareText className="size-5" aria-hidden />
              See responses
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
