"use client";

import { useEffect, useRef, useState } from "react";
import { History, X } from "lucide-react";
import type { SendListItem } from "@/lib/data/participant-sends";
import { MessagesSentList } from "./MessagesSentList";

/** The History icon beside Filters. Opens "Messages sent" in a right-side panel (full screen on a phone). */
export function MessagesHistory({ sends }: { sends: SendListItem[] }) {
  const [open, setOpen] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    iconRef.current?.focus();
  }

  // Lock page scroll while open and put it back on close or unmount.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  // Escape: a details dialog inside the panel closes itself first; only then does the panel close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (panelRef.current?.querySelector('[aria-labelledby="message-detail-title"]')) return;
      setOpen(false);
      iconRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={iconRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Messages sent"
        aria-haspopup="dialog"
        className="relative inline-flex items-center justify-center h-11 w-11 md:h-12 md:w-12 min-h-11 min-w-11 rounded-xl border border-pz-outline-variant/40 bg-pz-surface-container-lowest hover:bg-pz-surface-container text-pz-on-surface transition-colors"
      >
        <History className="w-4 h-4" aria-hidden="true" />
        {sends.length > 0 && (
          <span
            data-testid="history-badge"
            className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-pz-primary text-pz-on-primary text-[11px] font-bold tabular-nums"
          >
            {sends.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            data-testid="history-backdrop"
            aria-label="Close messages sent"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 bg-pz-on-surface/40 max-md:hidden"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Messages sent"
            tabIndex={-1}
            className="relative flex h-full w-full flex-col bg-pz-surface max-md:pt-[env(safe-area-inset-top)] md:max-w-xl md:border-l md:border-pz-outline-variant/40 md:shadow-2xl focus:outline-none"
          >
            <div className="flex items-center justify-end px-4 py-3">
              <button
                type="button"
                onClick={close}
                className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-xl border border-pz-outline-variant/40 bg-pz-surface-container-lowest hover:bg-pz-surface-container text-sm font-headline font-semibold text-pz-on-surface transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <MessagesSentList sends={sends} compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
