"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardStatus } from "@/lib/landing/settings-cards";

/** One numbered settings card: title, one-line blurb, a Ready / Needs attention tag, and a body that opens and closes. */
export function StepCard({ number, title, blurb, status, defaultOpen = true, children }: {
  number: number; title: string; blurb: string; status: CardStatus; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ready = status === "ready";
  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-pz-outline-variant bg-pz-surface-container-low">
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pz-surface-container-high font-headline text-xs font-bold text-pz-on-surface">{number}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-sm font-bold text-pz-on-surface">{title}</h3>
          <p className="font-body text-xs text-pz-on-surface-variant">{blurb}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-headline text-[11px] font-semibold",
            ready ? "bg-pz-primary-container text-pz-on-primary-container" : "bg-pz-secondary-container text-pz-on-secondary-container",
          )}
        >
          {ready ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
          {ready ? "Ready" : "Needs attention"}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Open"} ${title}`}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-pz-on-surface-variant hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:h-11 max-md:w-11"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </div>
      {open && <div className="space-y-4 border-t border-pz-outline-variant p-4">{children}</div>}
    </section>
  );
}
