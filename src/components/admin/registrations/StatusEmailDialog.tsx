"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, History, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { manualKindsFor, type ManualEmailKind } from "@/lib/landing/registration/manual-kinds";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";
import { STATUS_LABEL } from "./SendSummary";
import { BTN_CANCEL, BTN_PRIMARY, DIALOG_SURFACE } from "./EditDetailsDialog";

const KIND_LABEL: Record<ManualEmailKind, string> = { received: "Pending", paid: "Paid", underpaid: "Underpaid", reserved: "Reserved" };
const KIND_HINT: Record<ManualEmailKind, string> = {
  received: "We got your registration",
  paid: "Payment receipt and access",
  underpaid: "Rest of the payment is due",
  reserved: "Seat is being held",
};
/** What the person will read, for the mismatch warning. */
const KIND_EFFECT: Record<ManualEmailKind, string> = {
  received: "They will be told we have received their registration and are waiting for their payment.",
  paid: "They will be told their payment is confirmed and how to join.",
  underpaid: "They will be told their payment is short and asked to send the rest.",
  reserved: "They will be told their seat is being held for them.",
};
const KIND_FOR_STATUS: Partial<Record<RegistrationStatus, ManualEmailKind>> = {
  pending: "received",
  free: "received",
  paid: "paid",
  underpaid: "underpaid",
  reserved: "reserved",
};

/** "14 Oct 2026, 11:20 am" in Pakistan time. */
export function formatSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an earlier date";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" })
    .replace(" AM", " am")
    .replace(" PM", " pm");
  return `${date}, ${time}`;
}

/** Send one status email to one person again. Email text only: their status never changes. */
export function StatusEmailDialog({
  row,
  rowType,
  onClose,
}: {
  row: RegistrationListRow;
  rowType: "individual" | "lead" | "member";
  onClose: () => void;
}) {
  const router = useRouter();
  const kinds = manualKindsFor(rowType);
  const matching = KIND_FOR_STATUS[row.status];
  const [kind, setKind] = useState<ManualEmailKind>(matching && kinds.includes(matching) ? matching : kinds[0]);
  const [confirmAt, setConfirmAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = matching !== kind;

  function choose(k: ManualEmailKind) {
    if (busy) return;
    setKind(k);
    setConfirmAt(null);
    setError(null);
  }

  async function post(confirmedAgain: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}/status-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmedAgain ? { kind, confirmedAgain: true } : { kind }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: unknown; code?: unknown; sentAt?: unknown };
      if (res.ok) {
        onClose();
        router.refresh();
        return;
      }
      if (res.status === 409 && data.code === "needs-confirm") {
        setConfirmAt(typeof data.sentAt === "string" ? data.sentAt : "");
      } else {
        setError(typeof data.error === "string" && data.error !== "" ? data.error : "The email could not be sent. Try again.");
      }
    } catch {
      setError("The email could not be sent. Try again.");
    }
    setBusy(false);
  }

  function sendClicked() {
    const earlier = row.lastEmailAt[kind];
    if (earlier) {
      setConfirmAt(earlier);
      return;
    }
    void post(false);
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className={DIALOG_SURFACE}>
        <DialogHeader className="gap-2">
          <span className="self-start px-2 py-0.5 rounded bg-pz-surface-container text-pz-on-surface-variant text-[11px] font-headline font-bold">
            Status: {STATUS_LABEL[row.status]}
          </span>
          <DialogTitle className="font-headline font-extrabold text-xl">Status email</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            Choose which email to send to {row.name}. Sending it does not change their status.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant mb-2">Which email</legend>
          <div className="grid grid-cols-2 gap-2">
            {kinds.map((k) => (
              <label
                key={k}
                className={`relative flex items-start gap-2 p-3 max-md:min-h-11 rounded-xl border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pz-primary ${
                  kind === k ? "border-pz-primary bg-pz-primary-container/25" : "border-pz-outline-variant/40 bg-pz-surface-container-low hover:bg-pz-surface-container"
                }`}
              >
                <input
                  type="radio"
                  name={`status-email-${row.id}`}
                  value={k}
                  checked={kind === k}
                  onChange={() => choose(k)}
                  className="mt-0.5 accent-pz-primary"
                />
                <span className="flex flex-col min-w-0">
                  <span className="text-sm font-headline font-bold text-pz-on-surface">{KIND_LABEL[k]}</span>
                  <span className="text-[11px] text-pz-on-surface-variant">{KIND_HINT[k]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mismatch && (
          <div className="flex gap-3 p-3.5 rounded-lg bg-pz-secondary-fixed text-pz-on-secondary-fixed">
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-xs font-headline font-bold">{`You picked the ${KIND_LABEL[kind]} email, but this person's status is ${STATUS_LABEL[row.status]}.`}</p>
              <p className="text-xs">{KIND_EFFECT[kind]} Sending it does not change the person&apos;s status.</p>
            </div>
          </div>
        )}

        {confirmAt !== null && (
          <div className="flex gap-3 p-3.5 rounded-lg bg-pz-surface-container-low border border-pz-outline-variant/40">
            <History className="w-4 h-4 mt-0.5 shrink-0 text-pz-secondary" aria-hidden="true" />
            <p className="text-xs font-headline font-semibold text-pz-on-surface">
              {confirmAt === "" ? "This person already got this email. Send again?" : `This person already got this email on ${formatSentAt(confirmAt)}. Send again?`}
            </p>
          </div>
        )}

        {error && <p role="alert" className="text-xs font-headline font-semibold text-pz-error">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0 sm:space-x-3 max-md:flex-col">
          <button type="button" onClick={onClose} disabled={busy} className={BTN_CANCEL}>Cancel</button>
          {confirmAt !== null ? (
            <button type="button" onClick={() => void post(true)} disabled={busy} className={BTN_PRIMARY}>
              <Send className="w-4 h-4" aria-hidden="true" />
              Send again anyway
            </button>
          ) : (
            <button type="button" onClick={sendClicked} disabled={busy} className={BTN_PRIMARY}>
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Send email
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
