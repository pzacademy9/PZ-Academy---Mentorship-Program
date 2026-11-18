"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type AudienceStep = 1 | 2 | 3;

const STEPS: { n: AudienceStep; label: string }[] = [
  { n: 1, label: "Who" },
  { n: 2, label: "Check" },
  { n: 3, label: "Download" },
];

// One white rounded card with three numbered steps. Steps after maxStep cannot be opened yet.
export function AudienceStepper({
  step,
  maxStep,
  onGo,
}: {
  step: AudienceStep;
  maxStep: AudienceStep;
  onGo: (s: AudienceStep) => void;
}) {
  return (
    <nav aria-label="Progress" className="rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-2 lg:p-3">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map(({ n, label }) => {
          const current = n === step;
          const done = n < step;
          return (
            <li key={n}>
              <button
                type="button"
                aria-label={`${n} ${label}`}
                aria-current={current ? "step" : undefined}
                disabled={n > maxStep}
                onClick={() => onGo(n)}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 font-body text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 lg:flex-row lg:gap-3 lg:px-4",
                  current
                    ? "bg-pz-primary-container font-semibold text-pz-on-primary-container"
                    : "bg-pz-surface-container-lowest text-pz-on-surface-variant hover:bg-pz-surface-container-high",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    current ? "border-transparent bg-pz-primary text-pz-on-primary" : "border-pz-outline-variant",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                <span>{label}</span>
                {current && (
                  <span aria-hidden="true" className="hidden rounded-full bg-pz-primary px-2 py-0.5 text-xs font-semibold text-pz-on-primary lg:inline">
                    Active
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
