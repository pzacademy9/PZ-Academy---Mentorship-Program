"use client";

import { Check, Layers, Radio, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mode } from "@/lib/landing/registration/config";

type ChoiceId = "live" | "recorded" | "both";

const CHOICES: { id: ChoiceId; label: string; hint: string; modes: Mode[]; Icon: typeof Video }[] = [
  { id: "live", label: "Live only", hint: "Live classes only", modes: ["live"], Icon: Radio },
  { id: "recorded", label: "Recorded only", hint: "Recorded lessons only", modes: ["recorded"], Icon: Video },
  { id: "both", label: "Both", hint: "Students pick when they register", modes: ["live", "recorded"], Icon: Layers },
];

function selected(modes: Mode[]): ChoiceId | null {
  const live = modes.includes("live");
  const rec = modes.includes("recorded");
  if (live && rec) return "both";
  if (live) return "live";
  if (rec) return "recorded";
  return null;
}

/** Live only / Recorded only / Both. An empty `modes` (possible on older pages) selects nothing. */
export function ModeChoice({ modes, onChange }: { modes: Mode[]; onChange: (modes: Mode[]) => void }) {
  const current = selected(modes);
  return (
    <div role="radiogroup" aria-label="Who can register" className="grid gap-2 sm:grid-cols-3">
      {CHOICES.map(({ id, label, hint, modes: next, Icon }) => {
        const on = current === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(next)}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11",
              on ? "border-pz-solid-forest bg-pz-primary-container/40" : "border-pz-outline-variant bg-pz-surface-container-lowest hover:bg-pz-surface-container-high",
            )}
          >
            <Icon className="h-5 w-5 text-pz-on-surface-variant" aria-hidden="true" />
            <span className="font-headline text-sm font-bold text-pz-on-surface">{label}</span>
            <span className="font-body text-xs text-pz-on-surface-variant">{hint}</span>
            {on && <Check className="absolute right-2 top-2 h-4 w-4 text-pz-solid-forest" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
