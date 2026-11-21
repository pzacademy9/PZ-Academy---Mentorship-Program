"use client";

import { toast } from "sonner";
import { Copy, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { effectiveWindow, type WindowMinutes } from "@/lib/attendance/rules";
import { audienceFromJson } from "@/lib/classes/audience";
import { reminderLine, type ReminderTone } from "@/lib/classes/reminder-line";
import type { SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { attendanceMessage, feedbackMessage } from "@/lib/classes/share-messages";
import { CopyLinkMenu } from "./CopyLinkMenu";
import { useSessionEmails } from "./useSessionEmails";
import { dsDivider, dsLime, dsMuted, dsOutline } from "./ds";

// Copy attendance link is the one main (lime) button here; the others are forest outline.
const solid = `${dsLime} w-full`;
const outlined = `${dsOutline} w-full`;

const DOT: Record<ReminderTone, string> = {
  ok: "bg-[#7ED957] dark:bg-emerald-600",
  warn: "bg-amber-500",
  idle: "bg-[#D4EACC] dark:bg-pz-outline-variant",
};

export function ClassActionRow({
  cls, session, sends, now, onNeedAudience, batchTitle, batchWindow = { open: 15, close: 15 },
}: {
  cls: ClassSummary;
  session: SessionRow;
  sends: SessionSendState | undefined;
  now: Date;
  onNeedAudience: () => void;
  batchTitle: string;
  batchWindow?: WindowMinutes;
}) {
  const win = effectiveWindow(session, { checkin_open_minutes: batchWindow.open, checkin_close_minutes: batchWindow.close });
  const emails = useSessionEmails(session, sends);
  const line = reminderLine(session, sends, now);

  async function onSend() {
    if (!audienceFromJson(session.audience)) {
      toast.error("Choose who gets this email first");
      onNeedAudience();
      return;
    }
    await emails.sendNow();
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3">
        <CopyLinkMenu
          label="Copy attendance link"
          link={cls.attendanceLink}
          message={attendanceMessage({ batchTitle, link: cls.attendanceLink, startsAtIso: cls.startsAt, openMinutes: win.open, closeMinutes: win.close })}
          className={solid}
        />
        {cls.feedbackLink ? (
          <CopyLinkMenu
            label="Copy feedback link"
            link={cls.feedbackLink}
            message={feedbackMessage({ batchTitle, link: cls.feedbackLink, classNumber: cls.number })}
            className={outlined}
          />
        ) : (
          <button type="button" disabled className={outlined}>
            <Copy className="size-5" strokeWidth={1.75} aria-hidden />
            Copy feedback link
          </button>
        )}
        <button type="button" className={outlined} disabled={emails.busy} onClick={onSend}>
          <Mail className="size-5" strokeWidth={1.75} aria-hidden />
          Send emails
        </button>
      </div>
      {!cls.feedbackLink && <p className={`text-base ${dsMuted}`}>This class has no feedback link yet</p>}
      <div className={`pt-3 ${dsDivider}`}>
        <p role="status" className="flex items-center gap-2 font-fredoka text-base text-[#1A2E1F] dark:text-pz-on-surface">
          <span data-tone={line.tone} className={cn("size-2.5 shrink-0 rounded-full", DOT[line.tone])} aria-hidden />
          {line.text}
        </p>
      </div>
    </div>
  );
}
