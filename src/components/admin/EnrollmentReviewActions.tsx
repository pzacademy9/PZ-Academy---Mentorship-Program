"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Armchair, XCircle, CircleSlash, MoreVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import {
  REJECTION_REASONS,
  ACTION_TARGET_STATUS,
  type RejectionReason,
  type ReviewActionName,
} from "@/lib/validations/admin-enrollment";
import type { Database } from "@/lib/supabase/database.types";

type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];

const ACTIONS: Record<
  ReviewActionName,
  {
    label: string;
    icon: typeof CheckCircle2;
    button: string;
    confirmTitle: string;
    confirmBody: string;
    confirmLabel: string;
    confirmButton: string;
  }
> = {
  approve: {
    label: "Approve",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Approve this enrollment?",
    confirmBody:
      "The student gets immediate course access, their first lesson unlocks, and they'll be emailed a confirmation.",
    confirmLabel: "Approve enrollment",
    confirmButton: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
  },
  reserve: {
    label: "Reserve",
    icon: Armchair,
    button:
      "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant",
    confirmTitle: "Reserve this seat?",
    confirmBody:
      "The seat is held but no course content unlocks. The student is emailed asking them to complete payment.",
    confirmLabel: "Reserve seat",
    confirmButton: "bg-pz-gold text-white hover:bg-pz-gold/90",
  },
  reject: {
    label: "Reject",
    icon: XCircle,
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
    confirmTitle: "Reject this enrollment?",
    confirmBody:
      "The student is emailed the reason below and can submit a new payment afterwards.",
    confirmLabel: "Reject enrollment",
    confirmButton: "bg-pz-danger text-white hover:bg-pz-danger/90",
  },
  expire: {
    label: "Mark expired",
    icon: CircleSlash,
    button:
      "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant",
    confirmTitle: "Mark this enrollment expired?",
    confirmBody:
      "Course access is revoked and the seat is released. No email is sent for this action.",
    confirmLabel: "Mark expired",
    confirmButton: "bg-pz-outline text-white dark:text-pz-surface hover:bg-pz-outline/90",
  },
};

/**
 * Approve and Reject sit inline; Reserve and Mark-expired live behind the
 * overflow menu, per the Stitch screen's `more_vert` treatment — four flat
 * buttons per row made the table read as a wall of controls.
 */
const PRIMARY_ACTIONS: ReviewActionName[] = ["approve", "reject"];
const OVERFLOW_ACTIONS: ReviewActionName[] = ["reserve", "expire"];

/** An action is offered only if it would actually change the row's status. */
function isAvailable(action: ReviewActionName, status: EnrollmentStatus): boolean {
  return ACTION_TARGET_STATUS[action] !== status;
}

export function EnrollmentReviewActions({
  enrollmentId,
  status,
  studentName,
  courseTitle,
  size = "default",
}: {
  enrollmentId: string;
  status: EnrollmentStatus;
  studentName: string;
  courseTitle: string;
  size?: "default" | "compact";
}) {
  const router = useRouter();
  const [open, setOpen] = useState<ReviewActionName | null>(null);
  const [reason, setReason] = useState<RejectionReason>(REJECTION_REASONS[0]);
  const [note, setNote] = useState("");

  const config = open ? ACTIONS[open] : null;

  const { run: submit, pending: isPending } = useAsyncAction(async () => {
    if (!open) return;
    const action = open;

    const body =
      action === "reject"
        ? { action, reason, note: note.trim() || undefined }
        : { action, note: note.trim() || undefined };

    const res = await fetch(`/api/admin/enrollments/${enrollmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "Could not update this enrollment.");
      return;
    }

    setOpen(null);
    setNote("");
    toast.success(`${studentName} — ${ACTIONS[action].label.toLowerCase()} applied.`);
    router.refresh();
  });

  return (
    <>
      <div className={cn("flex items-center flex-wrap", size === "compact" ? "gap-1.5" : "gap-2")}>
        {PRIMARY_ACTIONS.filter((action) => isAvailable(action, status)).map((action) => {
          const { label, icon: Icon, button } = ACTIONS[action];
          return (
            <button
              key={action}
              type="button"
              onClick={() => {
                setNote("");
                setOpen(action);
              }}
              disabled={isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg font-headline font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                size === "compact" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
                "max-md:min-h-11",
                button,
              )}
            >
              <Icon className={size === "compact" ? "w-3.5 h-3.5" : "w-4 h-4"} />
              {label}
            </button>
          );
        })}

        {OVERFLOW_ACTIONS.some((action) => isAvailable(action, status)) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More actions"
              disabled={isPending}
              className="p-1.5 max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center rounded-full text-pz-on-surface-variant hover:bg-pz-surface-container transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary/30"
            >
              <MoreVertical className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {OVERFLOW_ACTIONS.filter((action) => isAvailable(action, status)).map((action) => {
                const { label, icon: Icon } = ACTIONS[action];
                return (
                  <DropdownMenuItem
                    key={action}
                    onSelect={() => {
                      setNote("");
                      setOpen(action);
                    }}
                    className="gap-2 font-body cursor-pointer"
                  >
                    <Icon className="w-4 h-4" />
                    {action === "reserve" ? "Reserve seat" : label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {config && (
            <>
              <DialogHeader>
                <DialogTitle className="font-headline text-pz-on-surface">
                  {config.confirmTitle}
                </DialogTitle>
                <DialogDescription className="font-body text-pz-on-surface-variant">
                  {studentName} — {courseTitle}
                </DialogDescription>
              </DialogHeader>

              <p className="font-body text-sm text-pz-on-surface-variant">{config.confirmBody}</p>

              {open === "reject" && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="rejection-reason"
                    className="font-headline text-sm font-semibold text-pz-on-surface"
                  >
                    Reason
                  </label>
                  <select
                    id="rejection-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value as RejectionReason)}
                    className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body text-pz-on-surface focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary"
                  >
                    {REJECTION_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {open !== "approve" && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="review-note"
                    className="font-headline text-sm font-semibold text-pz-on-surface"
                  >
                    Note to student{" "}
                    <span className="font-body font-normal text-pz-on-surface-variant">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="review-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Anything specific they should know…"
                    className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm max-md:text-base font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary resize-none"
                  />
                  {open === "reject" && (
                    <p className="font-body text-xs text-pz-on-surface-variant">
                      The reason and this note are included in the email to the student.
                    </p>
                  )}
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
                  loading={isPending}
                  className={cn(
                    "px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    config.confirmButton,
                  )}
                >
                  {isPending ? "Working…" : config.confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
