"use client";

import { RotateCcw } from "lucide-react";

/** Next to a field while a link is being edited: shows that this link has its own value for it. */
export function OverrideBadge({ overridden, onReset }: { overridden: boolean; onReset: () => void }) {
  if (!overridden) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-pz-primary-container px-2 py-0.5 font-body text-[11px] font-semibold text-pz-on-primary-container">
        Edited for this link
      </span>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-body text-[11px] font-semibold text-pz-primary hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Reset to main
      </button>
    </div>
  );
}
