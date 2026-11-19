"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { audienceFromJson } from "@/lib/classes/audience";
import { reminderLine, type ReminderTone } from "@/lib/classes/reminder-line";
import type { SessionRow } from "@/lib/data/attendance";
import type { ClassSummary } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { useSessionEmails } from "./useSessionEmails";

const btn =
  "inline-flex w-full items-center justify-center gap-2 px-4 min-h-12 rounded-lg font-headline text-base font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const solid = `${btn} bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container`;
const outlined = `${btn} border-2 border-pz-primary bg-pz-surface-container-lowest text-pz-primary hover:bg-pz-surface-container-low`;

const DOT: Record<ReminderTone, string> = {
  ok: "bg-emerald-600",
  warn: "bg-amber-500",
  idle: "bg-pz-outline-variant",
};

function CopyButton({ url, label, className }: { url: string; label: string; className: string }) {
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
    <button type="button" onClick={copy} className={className}>
      {copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function ClassActionRow({
  cls, session, sends, now, onNeedAudience,
}: {
  cls: ClassSummary;
  session: SessionRow;
  sends: SessionSendState | undefined;
  now: Date;
  onNeedAudience: () => void;
}) {
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
      <div className="grid gap-3 md:grid-cols-3">
        <CopyButton url={cls.attendanceLink} label="Copy attendance link" className={solid} />
        {cls.feedbackLink ? (
          <CopyButton url={cls.feedbackLink} label="Copy feedback link" className={outlined} />
        ) : (
          <button type="button" disabled className={outlined}>
            <Copy className="size-5" aria-hidden />
            Copy feedback link
          </button>
        )}
        <button type="button" className={outlined} disabled={emails.busy} onClick={onSend}>
          <Mail className="size-5" aria-hidden />
          Send emails
        </button>
      </div>
      {!cls.feedbackLink && <p className="text-base text-pz-on-surface-variant">This class has no feedback link yet</p>}
      <div className="border-t border-pz-outline-variant/60 pt-3">
        <p role="status" className="flex items-center gap-2 text-base text-pz-on-surface">
          <span data-tone={line.tone} className={cn("size-2.5 shrink-0 rounded-full", DOT[line.tone])} aria-hidden />
          {line.text}
        </p>
      </div>
    </div>
  );
}
