"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, Plus, Trash2, Save, CalendarClock } from "lucide-react";
import { MENTOR_TIMEZONES } from "@/lib/validations/admin-mentor";
import { computeAvailableSlots, type WeeklyRange } from "@/lib/data/session-slots";
import type { OwnAvailability } from "@/lib/data/mentor-availability";

const DAYS: { day: number; label: string }[] = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];

const inputClass =
  "bg-white border border-pz-outline-variant rounded-md px-3 py-2 text-pz-on-surface focus:ring-2 focus:ring-pz-primary focus:outline-none font-body w-32 shadow-sm";

function groupPreview(slots: string[], timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });
  const byDay = new Map<string, string[]>();
  for (const iso of slots) {
    const date = new Date(iso);
    const key = fmt.format(date);
    const list = byDay.get(key) ?? [];
    list.push(timeFmt.format(date));
    byDay.set(key, list);
  }
  return Array.from(byDay.entries());
}

export function AvailabilityForm({ availability }: { availability: OwnAvailability }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [timezone, setTimezone] = useState(availability.timezone || MENTOR_TIMEZONES[0]);
  const [ranges, setRanges] = useState<WeeklyRange[]>(availability.weeklyRanges);

  const preview = useMemo(() => {
    const slots = computeAvailableSlots({
      availability: { weeklyRanges: ranges },
      timezone,
      durationMinutes: 60,
      leadTimeHours: 24,
      bookedSlots: [],
      now: new Date(),
      daysAhead: 14,
    });
    return groupPreview(slots, timezone);
  }, [ranges, timezone]);

  function rangesForDay(day: number) {
    return ranges.filter((r) => r.day === day);
  }

  function toggleDay(day: number, enabled: boolean) {
    if (enabled) {
      setRanges((prev) => [...prev, { day, start: "09:00", end: "17:00" }]);
    } else {
      setRanges((prev) => prev.filter((r) => r.day !== day));
    }
  }

  function addRange(day: number) {
    setRanges((prev) => [...prev, { day, start: "09:00", end: "17:00" }]);
  }

  function removeRange(day: number, index: number) {
    const dayRanges = rangesForDay(day);
    const target = dayRanges[index];
    setRanges((prev) => prev.filter((r) => r !== target));
  }

  function updateRange(day: number, index: number, patch: Partial<WeeklyRange>) {
    const dayRanges = rangesForDay(day);
    const target = dayRanges[index];
    setRanges((prev) => prev.map((r) => (r === target ? { ...r, ...patch } : r)));
  }

  function save() {
    startTransition(async () => {
      const res = await fetch("/api/mentor/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, weeklyRanges: ranges }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not save availability.");
        return;
      }
      toast.success("Availability saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="flex-1 flex flex-col gap-6 w-full">
        <div className="bg-white rounded-xl shadow-card p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-pz-on-surface-variant">
            <Globe className="w-5 h-5 text-pz-primary" />
            <span className="font-body font-medium">Current Timezone</span>
          </div>
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass}>
            {MENTOR_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          <div className="p-6 border-b border-pz-outline-variant flex justify-between items-center">
            <h3 className="font-headline font-bold text-pz-on-surface">Weekly Hours</h3>
          </div>
          <div className="flex flex-col">
            {DAYS.map(({ day, label }) => {
              const dayRanges = rangesForDay(day);
              const enabled = dayRanges.length > 0;
              return (
                <div
                  key={day}
                  className={`flex flex-col sm:flex-row p-6 border-b border-pz-outline-variant last:border-b-0 ${enabled ? "" : "bg-pz-surface-container-low opacity-75"}`}
                >
                  <div className="flex items-center w-full sm:w-40 mb-4 sm:mb-0 shrink-0 gap-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => toggleDay(day, e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-pz-surface-dim peer-checked:bg-pz-primary rounded-full transition-colors" />
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                    </label>
                    <span className={`font-headline font-bold ${enabled ? "text-pz-on-surface" : "text-pz-on-surface-variant line-through"}`}>
                      {label}
                    </span>
                  </div>
                  {enabled ? (
                    <div className="flex-1 flex flex-col gap-3">
                      {dayRanges.map((range, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-3">
                          <input
                            type="time"
                            value={range.start}
                            onChange={(e) => updateRange(day, i, { start: e.target.value })}
                            className={inputClass}
                          />
                          <span className="text-pz-on-surface-variant">-</span>
                          <input
                            type="time"
                            value={range.end}
                            onChange={(e) => updateRange(day, i, { end: e.target.value })}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={() => removeRange(day, i)}
                            className="text-pz-outline hover:text-pz-danger transition-colors p-2 rounded-full hover:bg-pz-danger/10 ml-auto sm:ml-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addRange(day)}
                        className="text-pz-primary hover:text-pz-on-primary-container font-body font-medium flex items-center gap-1 w-max transition-colors text-sm"
                      >
                        <Plus className="w-4 h-4" /> Add another range
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center">
                      <span className="font-body text-pz-on-surface-variant italic">Unavailable</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="bg-pz-lime hover:bg-pz-mint text-pz-forest px-8 py-3 rounded-lg font-headline font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Availability"}
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      <aside className="w-full xl:w-[350px] shrink-0">
        <div className="bg-white rounded-xl shadow-card overflow-hidden sticky top-8 flex flex-col max-h-[700px]">
          <div className="p-6 border-b border-pz-outline-variant flex justify-between items-center">
            <h3 className="font-headline font-bold text-pz-on-surface">Live Preview</h3>
            <CalendarClock className="w-5 h-5 text-pz-tertiary" />
          </div>
          <p className="px-6 py-4 text-sm font-body text-pz-on-surface-variant border-b border-pz-outline-variant">
            Next 14 days of generated slots based on your schedule.
          </p>
          <div className="p-6 overflow-y-auto flex-1">
            {preview.length === 0 ? (
              <p className="font-body text-sm text-pz-on-surface-variant italic">No slots yet — turn on the days you&apos;re available.</p>
            ) : (
              preview.map(([date, times]) => (
                <div key={date} className="mb-6 last:mb-0">
                  <h4 className="font-headline font-bold text-pz-on-surface-variant mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-pz-primary-container" />
                    {date}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {times.map((t) => (
                      <span key={t} className="px-3 py-1.5 bg-pz-tertiary-fixed text-pz-on-tertiary-fixed-variant rounded-md font-body text-sm font-medium border border-pz-outline-variant shadow-sm">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
