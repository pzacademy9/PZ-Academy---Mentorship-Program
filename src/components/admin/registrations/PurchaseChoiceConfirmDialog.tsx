"use client";

import { useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { callPortal } from "@/lib/portal-client";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function PurchaseChoiceConfirmDialog({
  open,
  onOpenChange,
  pageId,
  label,
  count,
  optionKeys,
  optionLabels,
  onDone,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  label: string;
  count: number;
  optionKeys: string[];
  optionLabels: string[];
  onDone: (updated: number) => void;
  /** Button to give focus back to when the dialog closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await callPortal<{ updated: number; queued: number }>("/api/admin/landing/portal/choices", {
      pageId,
      label,
      optionKeys,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onOpenChange(false);
    onDone(r.data.updated);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (!o) setError(null);
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onCloseAutoFocus={(e) => {
          if (!returnFocusRef?.current) return;
          e.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-headline text-pz-on-surface">{`Apply to ${people(count)}?`}</DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            People who already have an app account get their access right away. Nobody is emailed.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg bg-pz-surface-container-low p-3.5 space-y-1 font-body text-sm text-pz-on-surface">
          <p className="text-pz-on-surface-variant">{label}</p>
          <p className="font-headline font-bold">{optionLabels.join(", ")}</p>
        </div>
        {error && <p role="alert" className="font-body text-sm text-pz-danger">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="inline-flex items-center justify-center px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Applying…" : `Apply to ${people(count)}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
