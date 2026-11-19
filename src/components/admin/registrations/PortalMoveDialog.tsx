"use client";

import { useState, type RefObject } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { callPortal } from "@/lib/portal-client";
import type { MovePreview } from "@/lib/data/portals";

export function PortalMoveDialog({
  open,
  onOpenChange,
  pageId,
  toCourseId,
  preview,
  onDone,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  toCourseId: string;
  preview: MovePreview;
  onDone: (moved: number) => void;
  /** Button to give focus back to when the dialog closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await callPortal<{ moved: number }>("/api/admin/landing/portal/move", { pageId, toCourseId });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onOpenChange(false);
    onDone(r.data.moved);
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
          <DialogTitle className="font-headline text-pz-on-surface">
            {`Move ${preview.toMove} ${preview.toMove === 1 ? "student" : "students"}?`}
          </DialogTitle>
          <DialogDescription className="font-body text-pz-on-surface-variant">
            Their progress in the old portal does not carry over. No emails are sent.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="font-body text-sm text-pz-danger">{error}</p>
        )}
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
            onClick={() => void move()}
            className="inline-flex items-center justify-center px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Moving…" : "Move students"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
