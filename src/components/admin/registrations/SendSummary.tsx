"use client";

import { AlertTriangle } from "lucide-react";
import type { Summary } from "@/lib/landing/participants/types";
import type { RegistrationStatus } from "@/lib/landing/registration/config";

export const STATUS_LABEL: Record<RegistrationStatus, string> = {
  paid: "Paid",
  pending: "Pending",
  reserved: "Reserved",
  underpaid: "Underpaid",
  free: "Free",
};
const STATUS_ORDER: RegistrationStatus[] = ["paid", "pending", "reserved", "underpaid", "free"];
const NOT_PAID_ORDER: RegistrationStatus[] = ["pending", "reserved", "underpaid", "free"];

export const STATUS_CHIP: Record<RegistrationStatus, string> = {
  paid: "bg-pz-primary-container/25 text-pz-on-primary-container",
  pending: "bg-pz-secondary-container/40 text-pz-on-secondary-container",
  reserved: "bg-pz-secondary-container/40 text-pz-on-secondary-container",
  underpaid: "bg-pz-error-container text-pz-on-error-container",
  free: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed",
};

/** "Pending 2, Underpaid 1": every status that is not Paid and has people in it. */
export function notPaidBreakdown(summary: Summary): string {
  return NOT_PAID_ORDER.filter((s) => summary.byStatus[s] > 0)
    .map((s) => `${STATUS_LABEL[s]} ${summary.byStatus[s]}`)
    .join(", ");
}

export function skippedTotal(summary: Summary): number {
  return Object.values(summary.skipped).reduce((a, b) => a + b, 0);
}

function noun(n: number): string {
  return n === 1 ? "person" : "people";
}

/** Plain-words lines for people left out of the send. Zero counts are not shown. */
function skippedLines(summary: Summary): string[] {
  const s = summary.skipped;
  const out: string[] = [];
  if (s.unsubscribed > 0) out.push(`${s.unsubscribed} unsubscribed`);
  if (s.no_email > 0) out.push(`${s.no_email} with no email`);
  if (s.no_phone > 0) out.push(`${s.no_phone} with no usable phone number`);
  if (s.merged > 0) out.push(`${s.merged} merged into another registration`);
  return out;
}

export interface SendSummaryProps {
  summary: Summary;
  channelWord: string;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  disabled: boolean;
  /** Plain-words message shown above the summary (for example "The list changed. Review it again."). */
  notice?: string | null;
}

export function SendSummary({ summary, channelWord, acknowledged, onAcknowledge, disabled, notice }: SendSummaryProps) {
  const left = skippedLines(summary);
  return (
    <div className="px-6 sm:px-7 py-2 flex flex-col gap-5">
      {notice && (
        <div role="alert" className="rounded-xl bg-pz-error-container text-pz-on-error-container px-4 py-3 text-xs font-headline font-semibold">
          {notice}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-headline font-bold text-pz-outline uppercase tracking-wider mr-1">Payment status:</span>
        {STATUS_ORDER.filter((s) => summary.byStatus[s] > 0).map((s) => (
          <span key={s} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-headline font-bold ${STATUS_CHIP[s]}`}>
            {`${STATUS_LABEL[s]}: ${summary.byStatus[s]}`}
          </span>
        ))}
      </div>

      <div className="text-xs font-body text-pz-on-surface-variant space-y-1">
        {summary.members > 0 && <p>{`${summary.members} of them are course members.`}</p>}
        {left.length > 0 && <p>{`Left out of this ${channelWord}: ${left.join(", ")}.`}</p>}
      </div>

      {summary.notPaid > 0 && (
        <div className="rounded-xl bg-pz-secondary-fixed/50 p-4 sm:p-5 flex flex-col gap-3 shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-pz-secondary-container text-pz-on-secondary-container flex items-center justify-center shrink-0 shadow-sm">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <h3 className="font-headline font-bold text-sm sm:text-base text-pz-on-secondary-fixed leading-snug">
              {`${summary.notPaid} ${noun(summary.notPaid)} ${summary.notPaid === 1 ? "has" : "have"} not paid (${notPaidBreakdown(summary)}). They will get this message too.`}
            </h3>
          </div>
          <div className="mt-2 bg-pz-surface-container-lowest/70 p-3.5 rounded-lg flex items-center gap-3">
            <input
              id="unpaid-acknowledgement"
              type="checkbox"
              checked={acknowledged}
              disabled={disabled}
              onChange={(e) => onAcknowledge(e.target.checked)}
              className="w-5 h-5 rounded accent-pz-primary cursor-pointer"
            />
            <label htmlFor="unpaid-acknowledgement" className="font-headline font-semibold text-xs sm:text-sm text-pz-on-surface cursor-pointer select-none">
              I understand that people who have not paid will get this message
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
