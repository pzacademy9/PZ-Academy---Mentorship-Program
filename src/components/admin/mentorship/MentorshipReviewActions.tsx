"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
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
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
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
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");

  const actions = kind === "booking" ? BOOKING_ACTIONS : APPLICATION_ACTIONS;
  const targetStatus: Record<Action, string> =
    kind === "booking" ? { primary: "confirmed", secondary: "cancelled" } : { primary: "approved", secondary: "rejected" };

  const config = open ? actions[open] : null;
  const isAvailable = (action: Action) => targetStatus[action] !== status;

  function submit() {
    if (!open) return;
    const action = open;

    startTransition(async () => {
      const res = await fetch(`/api/admin/mentorship/${kind === "booking" ? "bookings" : "applications"}/${id}`, {
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
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
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
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-headline font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                button,
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
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
                    className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary resize-none"
                  />
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Working…" : config.label}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
