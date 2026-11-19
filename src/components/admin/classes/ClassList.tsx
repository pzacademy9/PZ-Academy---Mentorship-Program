"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPkt } from "@/lib/attendance/rules";
import type { ClassSummary } from "@/lib/data/class-overview";
import { dsFocus, dsIdle, dsSelected } from "./ds";

const STATUS_LABEL = { done: "Done", today: "Today", upcoming: "Upcoming" } as const;

/** Day strip: scrolls sideways on a phone, a list down the side on a wide screen. */
export function ClassList({
  classes, selectedId, onSelect,
}: {
  classes: ClassSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex gap-2 overflow-x-auto p-1 lg:grid lg:grid-cols-1 lg:overflow-visible lg:p-0">
      {classes.map((c) => {
        const on = c.id === selectedId;
        return (
          <li key={c.id} className="shrink-0 max-lg:w-36 lg:w-auto">
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-3xl border p-3 text-left font-poppins transition-colors",
                dsFocus,
                on ? `${dsSelected} ring-1 ring-[#194B32] dark:ring-pz-primary` : dsIdle,
              )}
            >
              <span className="flex w-full items-center justify-between gap-1 font-montserrat text-base font-extrabold tracking-tight text-[#0F3D22] dark:text-pz-on-surface">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("size-2.5 rounded-full", c.status === "done" ? "bg-[#196432] dark:bg-emerald-600" : c.status === "today" ? "bg-[#7ED957] dark:bg-amber-500" : "bg-[#D4EACC] dark:bg-pz-outline-variant")} />
                  Day {c.number}
                </span>
                {c.status === "done" && <Check className="size-5 text-[#196432] dark:text-emerald-600" strokeWidth={1.75} aria-label="Done" />}
              </span>
              <span className="text-base text-[#1A2E1F] dark:text-pz-on-surface-variant max-lg:hidden">{c.title}</span>
              <span className="text-base text-[#4D6B54] dark:text-pz-on-surface-variant">{formatPkt(c.startsAt).split(",")[0]}</span>
              <span
                className={cn(
                  "rounded-full px-2 font-fredoka text-[15px] font-medium",
                  c.status === "today" ? "bg-[#7ED957] text-[#0F3D22] dark:bg-pz-primary dark:text-pz-on-primary" : "text-[#4D6B54] dark:text-pz-on-surface-variant",
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
