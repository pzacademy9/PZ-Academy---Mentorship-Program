"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function dateWords(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** Month grid, weeks start on Monday. `max` is the most days that can be picked (null = no limit). */
export function ClassCalendar({
  month, selected, max, onToggle, onMonthChange,
}: {
  month: string;
  selected: string[];
  max: number | null;
  onToggle: (date: string) => void;
  onMonthChange?: (month: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const full = max !== null && selected.length >= max;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`),
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-headline text-lg font-bold text-pz-on-surface">{monthTitle(month)}</h3>
        <div className="flex gap-2">
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange?.(shiftMonth(month, -1))}
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-pz-outline-variant text-pz-on-surface hover:bg-pz-surface-container-low">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange?.(shiftMonth(month, 1))}
            className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-pz-outline-variant text-pz-on-surface hover:bg-pz-surface-container-low">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((w) => (
          <div key={w} className="pb-1 text-center text-sm font-headline font-bold text-pz-on-surface-variant">{w}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`blank-${i}`} />;
          const on = selected.includes(date);
          return (
            <button
              key={date}
              type="button"
              aria-pressed={on}
              aria-label={dateWords(date)}
              onClick={() => onToggle(date)}
              className={`h-12 rounded-lg text-base font-headline font-bold transition-colors ${
                on
                  ? "bg-pz-primary text-pz-on-primary"
                  : `border border-pz-outline-variant/60 bg-pz-surface-container-lowest text-pz-on-surface hover:bg-pz-surface-container-low ${full ? "opacity-50" : ""}`
              }`}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
