"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Trash2 } from "lucide-react";
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

type Action = "primary" | "secondary";

interface ActionConfig {
  label: string;
  icon: typeof CheckCircle2;
  button: string;
  confirmTitle: string;
  confirmBody: string;
}

const BOOKING_ACTIONS: Record<Action, ActionConfig> = {
  primary: {
    label: "Confirm",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Confirm this booking?",
    confirmBody: "The student is emailed a confirmation.",
  },
  secondary: {
    label: "Cancel",
    icon: XCircle,
    button: "border border-pz-solid-danger/40 text-pz-danger hover:bg-pz-solid-danger/10",
    confirmTitle: "Cancel this booking?",
    confirmBody: "The student is emailed the reason below.",
  },
};

const APPLICATION_ACTIONS: Record<Action, ActionConfig> = {
  primary: {
    label: "Approve",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Approve this application?",
    confirmBody: "The applicant is emailed a confirmation.",
  },
  secondary: {
    label: "Reject",
    icon: XCircle,
    button: "border border-pz-solid-danger/40 text-pz-danger hover:bg-pz-solid-danger/10",
    confirmTitle: "Reject this application?",
    confirmBody: "The applicant is emailed the reason below.",
  },
};

export function MentorshipReviewActions({
  kind,
  id,
  status,
  name,
}: {
  kind: "booking" | "application";
  id: string;
  status: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const actions = kind === "booking" ? BOOKING_ACTIONS : APPLICATION_ACTIONS;
  const targetStatus: Record<Action, string> =
    kind === "booking" ? { primary: "confirmed", secondary: "cancelled" } : { primary: "approved", secondary: "rejected" };
  const recordLabel = kind === "booking" ? "booking" : "application";
  const apiPath = `/api/admin/mentorship/${kind === "booking" ? "bookings" : "applications"}/${id}`;

  const config = open ? actions[open] : null;
  const isAvailable = (action: Action) => targetStatus[action] !== status;

  const { run: submit, pending: submitPending } = useAsyncAction(async () => {
    if (!open) return;
    const action = open;

    try {
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus[action],
          reason: action === "secondary" ? reason.trim() || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this record.");
        return;
      }

      setOpen(null);
      setReason("");
      toast.success(`${name} — ${actions[action].label.toLowerCase()} applied.`);
      router.refresh();
    } catch {
      toast.error("Network error — could not reach the server.");
    }
  });

  const { run: submitDelete, pending: deletePending } = useAsyncAction(async () => {
    try {
      const res = await fetch(apiPath, { method: "DELETE" });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? `Could not delete this ${recordLabel}.`);
        return;
      }

      const payload = (await res.json().catch(() => null)) as { warnings?: string[] } | null;
      setDeleteOpen(false);

      if (!payload?.warnings || payload.warnings.length === 0) {
        toast.success(`${name} deleted.`);
      } else {
        toast.warning(`${name} deleted from the database. ${payload.warnings.join(" ")}`);
      }
      router.refresh();
    } catch {
      toast.error("Network error — could not reach the server.");
    }
  });
  const isPending = submitPending || deletePending;

  return (
    <>
      <div className="flex items-center flex-wrap gap-1.5">
        {(["primary", "secondary"] as Action[]).filter(isAvailable).map((action) => {
          const { label, icon: Icon, button } = actions[action];
          return (
            <button
              key={action}
              type="button"
              onClick={() => {
                setReason("");
                setOpen(action);
              }}
              disabled={isPending}
              className={cn(
                "inline-flex items-center gap-1.5 max-md:min-h-11 rounded-lg px-3 py-1.5 text-xs font-headline font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                button,
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
          title={`Delete this ${recordLabel}`}
          aria-label={`Delete this ${recordLabel}`}
          className="inline-flex items-center justify-center max-md:min-h-11 max-md:min-w-11 rounded-lg p-1.5 text-pz-danger hover:bg-pz-solid-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {config && (
            <>
              <DialogHeader>
                <DialogTitle className="font-headline text-pz-on-surface">{config.confirmTitle}</DialogTitle>
                <DialogDescription className="font-body text-pz-on-surface-variant">{name}</DialogDescription>
              </DialogHeader>

              <p className="font-body text-sm text-pz-on-surface-variant">{config.confirmBody}</p>

              {open === "secondary" && (
                <div className="space-y-1.5">
                  <label htmlFor="mentorship-reason" className="font-headline text-sm font-semibold text-pz-on-surface">
                    Reason <span className="font-body font-normal text-pz-on-surface-variant">(optional)</span>
                  </label>
                  <textarea
                    id="mentorship-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Included in the email…"
                    className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm max-md:text-base font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary resize-none"
                  />
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  disabled={isPending}
                  className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <Button
                  variant="bare"
                  size="bare"
                  type="button"
                  onClick={() => submit()}
                  loading={submitPending}
                  disabled={isPending}
                  className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Working…" : config.label}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">
              Delete this {recordLabel}?
            </DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">{name}</DialogDescription>
          </DialogHeader>

          <p className="font-body text-sm text-pz-on-surface-variant">
            This permanently removes it from the database and, where it can be matched, the Google Sheet. This
            cannot be undone.
          </p>

          {status !== "pending" && (
            <p className="font-body text-sm font-semibold text-pz-danger">
              This {recordLabel} is currently {status} — the student will not be notified of this deletion.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              variant="bare"
              size="bare"
              type="button"
              onClick={() => submitDelete()}
              loading={deletePending}
              disabled={isPending}
              className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-solid-danger text-white hover:bg-pz-solid-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
