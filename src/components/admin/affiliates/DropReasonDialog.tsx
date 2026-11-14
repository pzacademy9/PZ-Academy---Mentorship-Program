"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const MAX = 500;

/**
 * Asks why someone is being dropped. A bottom sheet on a phone and a centred dialog on a computer
 * (the shared Dialog does both). The reason is required, trimmed, and at most 500 characters.
 */
export function DropReasonDialog({
  name,
  open,
  onCancel,
  onConfirm,
  pending = false,
}: {
  name: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  pending?: boolean;
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const reason = text.trim();
  const tooLong = text.length > MAX;
  const valid = reason.length > 0 && reason.length <= MAX;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setText("");
          onCancel();
        }
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md space-y-0 max-md:w-full"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          box.current?.focus();
        }}
      >
        <div className="min-w-0 space-y-4">
          <div className="min-w-0 pr-8">
            <DialogTitle className="break-words font-headline text-lg font-bold text-pz-secondary">Drop {name}?</DialogTitle>
            <DialogDescription className="sr-only">Give a reason. It is saved for your records.</DialogDescription>
          </div>
          <div>
            <label htmlFor="drop-reason" className="mb-1.5 block font-headline text-xs font-bold uppercase tracking-wide text-pz-on-surface-variant">
              Reason <span className="text-pz-danger" aria-hidden="true">*</span>
            </label>
            <textarea
              id="drop-reason"
              ref={box}
              rows={3}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby="drop-reason-help drop-reason-count"
              className="w-full min-w-0 resize-none rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 font-body text-sm max-md:text-base focus:outline-none focus:ring-2 focus:ring-pz-primary/20"
            />
            <div className="mt-1.5 flex items-start justify-between gap-3">
              <p id="drop-reason-help" className="font-body text-xs text-pz-on-surface-variant">
                This is saved for your records. They will get an email saying their status is Dropped.
              </p>
              <span id="drop-reason-count" className={`shrink-0 font-body text-xs ${tooLong ? "font-bold text-pz-danger" : "text-pz-on-surface-variant"}`}>
                {text.length} / {MAX}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:flex md:justify-end">
            <Button type="button" variant="outline" onClick={() => { setText(""); onCancel(); }}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={!valid || pending} onClick={() => valid && onConfirm(reason)}>Drop</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
