"use client";

import { Globe, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WhatsAppMode } from "@/lib/crm/whatsapp-mode";

const choiceClass =
  "min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-headline font-bold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary focus-visible:ring-offset-2";

/**
 * Asked once per session on the first Open WhatsApp click. The choice buttons are themselves
 * user gestures, so the caller can pre-open the Web tab straight from onChoose.
 */
export function WhatsAppChooserDialog({
  open,
  onChoose,
  onCancel,
}: {
  open: boolean;
  onChoose: (mode: WhatsAppMode) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="bg-pz-surface-container-lowest text-pz-on-surface font-body">
        <DialogHeader>
          <DialogTitle className="font-headline font-bold">How do you use WhatsApp?</DialogTitle>
          <DialogDescription className="text-pz-on-surface-variant">
            Pick one. We will use it for the rest of this session.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onChoose("web")}
            className={`${choiceClass} bg-pz-primary text-pz-on-primary hover:bg-pz-primary/95`}
          >
            <Globe className="w-5 h-5" aria-hidden="true" />
            WhatsApp Web
          </button>
          <button
            type="button"
            onClick={() => onChoose("app")}
            className={`${choiceClass} bg-pz-surface-container-low text-pz-on-surface hover:bg-pz-surface-container-high`}
          >
            <Smartphone className="w-5 h-5" aria-hidden="true" />
            WhatsApp app
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small "Using WhatsApp Web. Change" line under the open button. */
export function ChangeModeLink({
  mode,
  onChange,
  disabled = false,
}: {
  mode: WhatsAppMode | null;
  onChange: () => void;
  disabled?: boolean;
}) {
  if (!mode) return null;
  return (
    <p className="text-[11px] text-center text-pz-on-surface-variant">
      Using {mode === "web" ? "WhatsApp Web" : "the WhatsApp app"}.{" "}
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        className="min-h-11 px-2 disabled:opacity-50 font-headline font-semibold text-pz-primary underline underline-offset-4"
      >
        Change
      </button>
    </p>
  );
}
