"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Star, PartyPopper, X } from "lucide-react";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { OUTCOME_BUTTONS } from "@/lib/crm/sales-ui";
import type { OutcomeKind } from "@/lib/crm/followup";
import { NotInterestedDialog } from "./NotInterestedDialog";

const ICONS = { replied: MessageCircle, interested: Star, bought: PartyPopper, not_interested: X } as const;
// Hover pairs ported 1:1 from the Stitch outcome pills (today-queue-desktop.html, "Quick Outcome Logger Pills").
const HOVER: Record<OutcomeKind, string> = {
  replied: "hover:bg-pz-primary-container hover:text-pz-on-primary-container",
  interested: "hover:bg-pz-secondary-fixed hover:text-pz-on-secondary-fixed",
  bought: "hover:bg-pz-tertiary-fixed hover:text-pz-on-tertiary-fixed",
  not_interested: "hover:bg-pz-error-container hover:text-pz-on-error-container",
};
const DONE: Record<OutcomeKind, string> = {
  replied: "Saved. They come back to your list tomorrow.",
  interested: "Saved. They come back to your list in 2 days.",
  bought: "Saved. Well done!",
  not_interested: "Saved. They leave your list.",
};

export function OutcomeButtons({
  contactId,
  onLogged,
  disabled,
}: {
  contactId: string;
  onLogged: (kind: OutcomeKind, nextFollowupAt: string | null) => void;
  disabled?: boolean;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const { run: log, pending } = useAsyncAction(async (kind: OutcomeKind, askedToStop?: boolean) => {
    try {
      const res = await fetch(`/api/sales/contacts/${contactId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(askedToStop ? { kind, askedToStop: true } : { kind }),
      });
      const body = (await res.json().catch(() => null)) as { nextFollowupAt?: string | null; error?: string } | null;
      if (!res.ok) {
        toast.error(body?.error ?? "Could not save that.");
        return;
      }
      toast.success(askedToStop ? "Saved. They will not be messaged again." : DONE[kind]);
      onLogged(kind, body?.nextFollowupAt ?? null);
    } catch {
      toast.error("Could not save that.");
    }
  });

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-headline font-semibold text-pz-on-surface-variant">What happened?</span>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
        {OUTCOME_BUTTONS.map(({ kind, label }) => {
          const Icon = ICONS[kind];
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled || pending}
              onClick={() => (kind === "not_interested" ? setAskOpen(true) : void log(kind))}
              className={`min-h-11 px-3.5 py-2 rounded-lg bg-pz-surface-container-low text-xs font-headline font-semibold text-pz-on-surface transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${HOVER[kind]}`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      <NotInterestedDialog
        open={askOpen}
        onCancel={() => setAskOpen(false)}
        onChoose={(choice) => {
          setAskOpen(false);
          void log("not_interested", choice === "stop");
        }}
      />
    </div>
  );
}
