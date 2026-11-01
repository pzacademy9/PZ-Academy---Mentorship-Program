"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CardStatus } from "@/lib/classes/card-status";

const BADGE = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  idle: "bg-pz-surface-container-high text-pz-on-surface-variant",
} as const;

/**
 * A card that folds on a phone and is always open from the lg breakpoint up. The content stays in
 * the page when folded (hidden with CSS only). The parent owns `open`, so a button elsewhere can open it.
 */
export function FoldCard({
  id, icon, title, status, open, onToggle, children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  status: CardStatus;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-pz-outline-variant/60 bg-pz-surface-container-lowest p-3 text-left lg:hidden"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-pz-surface-container text-pz-primary" aria-hidden>
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-headline text-lg font-bold text-pz-on-surface">{title}</span>
          <span className="block text-base text-pz-on-surface-variant">{status.line}</span>
        </span>
        {status.badge && (
          <span className={cn("shrink-0 rounded-full px-3 py-1 text-sm font-headline font-bold", BADGE[status.tone])}>{status.badge}</span>
        )}
        <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-pz-on-surface-variant transition-transform", open && "rotate-180")} />
      </button>
      <div id={id} className={cn(!open && "max-lg:hidden", open && "max-lg:mt-2")}>
        {children}
      </div>
    </div>
  );
}
