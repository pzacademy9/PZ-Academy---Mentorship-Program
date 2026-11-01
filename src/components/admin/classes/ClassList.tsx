"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPkt } from "@/lib/attendance/rules";
import type { ClassSummary } from "@/lib/data/class-overview";

const STATUS_LABEL = { done: "Done", today: "Today", upcoming: "Upcoming" } as const;

/** Day strip: 3 columns on a phone, a list down the side on a wide screen. */
export function ClassList({
  classes, selectedId, onSelect,
}: {
  classes: ClassSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-1 lg:overflow-visible">
      {classes.map((c) => {
        const on = c.id === selectedId;
        return (
          <li key={c.id} className="shrink-0 max-lg:w-36 lg:w-auto">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-colors",
                on
                  ? "border-pz-primary bg-pz-primary/10"
                  : "border-pz-outline-variant/60 bg-pz-surface-container-lowest hover:bg-pz-surface-container-low",
              )}
            >
              <span className="flex w-full items-center justify-between gap-1 font-headline text-base font-bold text-pz-on-surface">
                Day {c.number}
                {c.status === "done" && <Check className="size-5 text-emerald-600" aria-label="Done" />}
              </span>
              <span className="text-base text-pz-on-surface-variant max-lg:hidden">{c.title}</span>
              <span className="text-base text-pz-on-surface-variant">{formatPkt(c.startsAt).split(",")[0]}</span>
              <span
                className={cn(
                  "rounded-full px-2 text-base font-headline font-bold",
                  c.status === "today" ? "bg-pz-primary text-pz-on-primary" : "text-pz-on-surface-variant",
                )}
              >
                {STATUS_LABEL[c.status]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
