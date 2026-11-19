"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { SessionRow } from "@/lib/data/attendance";
import type { SessionSendState } from "@/lib/data/session-emails";
import {
  emailMissingOnly, emailNewZoomLink, emailUpdatedTime, resendClassDetails, sendReminderNow, sendTestEmailToMe, type ActionResult,
} from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

/** The class email actions (with their confirm dialogs), shared by the action row and the attendance card. */
export function useSessionEmails(session: SessionRow, sends: SessionSendState | undefined) {
  const confirm = useConfirm();
  const [busy, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast.success(res.message);
      } else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }

  async function sendNow() {
    // Any earlier Zoom link or class details email means people have already got something.
    const again = !!(sends?.reminderAt || sends?.updateAt);
    const ok = await confirm({
      title: again ? "Email students again?" : "Email the Zoom link now?",
      description: again
        ? "This sends the class details again to everyone listed under Will get this email, including people who already got it. To skip them, use Email only those who haven't got it. Tip: send yourself a test first."
        : "This sends the Zoom link and class time to everyone listed under Will get this email. Tip: send yourself a test first.",
      confirmLabel: "Email to students",
    });
    if (!ok) return;
    run(() => (again ? resendClassDetails(session.id) : sendReminderNow(session.id)));
  }

  async function missingOnly() {
    const ok = await confirm({
      title: "Email people who haven't got it?",
      description: "This sends the Zoom link only to people who have not received it yet. People already sent, or still waiting to be sent, are skipped. People whose email failed are tried again.",
      confirmLabel: "Email them",
    });
    if (ok) run(() => emailMissingOnly(session.id));
  }

  async function newZoomLink() {
    const ok = await confirm({
      title: "Email the new Zoom link?",
      description: "Make sure you saved the new Zoom link first. This tells everyone listed under Will get this email that the link has changed, including people who already got the old one.",
      confirmLabel: "Email new link",
    });
    if (ok) run(() => emailNewZoomLink(session.id));
  }

  return {
    busy,
    sendNow,
    missingOnly,
    newZoomLink,
    updatedTime: () => run(() => emailUpdatedTime(session.id)),
    testToMe: () => run(() => sendTestEmailToMe(session.id)),
  };
}
