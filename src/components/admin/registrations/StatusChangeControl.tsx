"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Info, RefreshCw, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format-money";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import {
  CHANGEABLE_STATUSES,
  STATUS_CHANGE_MESSAGES,
  checkStatusChange,
  type ChangeableStatus,
} from "@/lib/landing/registration/status-rules";
import { RegistrationStatusBadge, REGISTRATION_STATUS_LABELS } from "./RegistrationStatusBadge";

const OPTION_HELP: Record<ChangeableStatus, string> = {
  pending: "Waiting for the payment to be checked.",
  reserved: "Seat held for now.",
  underpaid: "Paid less than the price. Enter the amount received.",
  paid: "Payment received in full.",
};

/** How long to wait for the refreshed page to show the saved status before falling back to a full reload. */
const REFRESH_GRACE_MS = 2500;

const CONFLICT_MESSAGE = "Someone else changed this just now. Reload to see the latest.";

/**
 * "Change status" button and dialog. Free rows have no payment, so they get no control at all.
 * `endpoint` is the PATCH route (admin or sales); the status shown is also sent as `from`, so a
 * row that moved on in the meantime answers 409 instead of being overwritten.
 */
export function StatusChangeControl({
  registrationId,
  endpoint,
  status,
  expectedAmount,
  currency,
  studentName,
  groupSize = 1,
}: {
  registrationId: string;
  endpoint: string;
  status: RegistrationStatus;
  expectedAmount: number | null;
  currency: string;
  studentName: string;
  groupSize?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ChangeableStatus | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  // After a save we refresh the server-rendered page. If the new status has not arrived after a
  // short grace period (a refresh that was dropped), reload the page so nobody sees a stale badge.
  const awaiting = useRef<ChangeableStatus | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearReloadTimer = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = null;
  };
  useEffect(() => {
    if (awaiting.current !== null && status === awaiting.current) {
      awaiting.current = null;
      clearReloadTimer();
    }
  }, [status]);
  useEffect(() => clearReloadTimer, []);

  const { run: submit, pending } = useAsyncAction(async () => {
    if (!choice) return;
    const typed = choice === "underpaid" && amount.trim() !== "" ? Number(amount) : null;
    const check = checkStatusChange({ rowType: "individual", from: status, to: choice, expectedAmount, amount: typed });
    if (!check.ok) {
      setError(STATUS_CHANGE_MESSAGES[check.reason]);
      return;
    }
    setError(null);

    const body: { status: ChangeableStatus; from: RegistrationStatus; amount?: number } = { status: choice, from: status };
    if (choice === "underpaid" && typed !== null) body.amount = typed;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      return;
    }
    if (res.status === 409) {
      setConflict(true);
      return;
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not change the status. Try again.");
      return;
    }
    setOpen(false);
    toast.success(`${studentName} marked ${REGISTRATION_STATUS_LABELS[choice].toLowerCase()}.`);
    router.refresh();
    if (choice !== status) {
      awaiting.current = choice;
      clearReloadTimer();
      reloadTimer.current = setTimeout(() => {
        if (awaiting.current !== null) window.location.reload();
      }, REFRESH_GRACE_MS);
    }
  });

  if (status === "free") return null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setChoice(null);
      setAmount("");
      setError(null);
      setConflict(false);
    }
  }

  const locked = conflict || pending;

  return (
    <>
      <button
        type="button"
        data-registration-id={registrationId}
        onClick={() => onOpenChange(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors"
      >
        Change status
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">Change status</DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant flex flex-wrap items-center gap-2">
              <span>{studentName}</span>
              <span className="text-xs">Current status:</span>
              <RegistrationStatusBadge status={status} />
            </DialogDescription>
          </DialogHeader>

          {conflict && (
            <div role="alert" className="rounded-lg border border-pz-solid-danger/40 bg-pz-solid-danger/10 p-3 space-y-3">
              <p className="flex items-start gap-2 font-headline font-bold text-sm text-pz-danger">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{CONFLICT_MESSAGE}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Reload
              </button>
            </div>
          )}

          {groupSize > 1 && (
            <p className="flex items-start gap-2 rounded-lg bg-pz-surface-container p-3 font-body text-sm text-pz-on-surface-variant">
              <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-headline text-pz-on-surface">Changing the lead changes the whole group.</strong>{" "}
                All {groupSize} seats move to the new status.
              </span>
            </p>
          )}

          <fieldset disabled={locked} className="space-y-2 min-w-0">
            <legend className="font-headline text-sm font-semibold text-pz-on-surface mb-1">New status</legend>
            {CHANGEABLE_STATUSES.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer",
                  choice === s ? "border-pz-primary bg-pz-primary/5" : "border-pz-outline-variant/60 hover:bg-pz-surface-container",
                  locked && "opacity-60 cursor-not-allowed",
                )}
              >
                <input
                  type="radio"
                  name="new-status"
                  value={s}
                  checked={choice === s}
                  onChange={() => {
                    setChoice(s);
                    setError(null);
                  }}
                  className="mt-1 accent-pz-primary"
                />
                <span className="min-w-0">
                  <span className="block font-headline font-bold text-sm text-pz-on-surface">{REGISTRATION_STATUS_LABELS[s]}</span>
                  <span className="block font-body text-xs text-pz-on-surface-variant">{OPTION_HELP[s]}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {choice === "underpaid" && (
            <div className="space-y-1.5 rounded-lg bg-pz-surface-container p-3">
              <p className="flex items-center gap-2 font-headline font-bold text-sm text-pz-on-surface">
                <Wallet className="w-4 h-4" aria-hidden="true" /> Amount received
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest overflow-hidden">
                  <span className="px-3 text-sm font-headline font-semibold text-pz-on-surface-variant">{currency}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label="Amount received"
                    aria-invalid={error ? true : undefined}
                    value={amount}
                    disabled={locked}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setError(null);
                    }}
                    className="w-36 py-2.5 pr-3 text-sm max-md:text-base bg-transparent font-body text-pz-on-surface focus:outline-none"
                  />
                </div>
                <span className="font-body text-sm text-pz-on-surface-variant">
                  Full price: <strong className="font-headline text-pz-on-surface tabular-nums">{formatMoney(expectedAmount, currency)}</strong>
                </span>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="font-body text-sm text-pz-danger">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              variant="bare"
              size="bare"
              type="button"
              onClick={() => submit()}
              loading={pending}
              disabled={!choice || conflict}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Saving…" : "Save status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
