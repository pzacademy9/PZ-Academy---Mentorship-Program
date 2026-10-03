"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

interface Props {
  bookingId: string;
  mentorSlug: string;
  mentorName: string;
  packageName: string;
  sessionsNeeded: number;
}

function groupBySlotDay(slots: string[], timezone: string) {
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
  const map = new Map<string, string[]>();
  for (const iso of slots) {
    const key = dayFmt.format(new Date(iso));
    const list = map.get(key) ?? [];
    list.push(iso);
    map.set(key, list);
  }
  return map;
}

export function BookSessionsStepper({ bookingId, mentorSlug, mentorName, packageName, sessionsNeeded }: Props) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [allSlots, setAllSlots] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [selected, setSelected] = useState<string[]>([]);
  const [activeDay, setActiveDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function loadSlots() {
    setLoading(true);
    return fetch(`/api/mentors/${mentorSlug}/slots`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load available slots.");
        return r.json() as Promise<{ slots: string[]; timezone: string }>;
      })
      .then((data) => {
        setAllSlots(data.slots);
        setTimezone(data.timezone);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load available slots.");
        setLoading(false);
      });
  }

  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorSlug]);

  const remaining = useMemo(() => allSlots.filter((s) => !selected.includes(s)), [allSlots, selected]);
  const byDay = useMemo(() => groupBySlotDay(remaining, timezone), [remaining, timezone]);
  const days = useMemo(() => Array.from(byDay.keys()), [byDay]);
  const currentDay = activeDay ?? days[0] ?? null;
  const dayFmtLong = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true });

  const sessionIndex = selected.length; // 0-based index of the slot being picked now
  const done = selected.length === sessionsNeeded;

  function pickSlot(iso: string) {
    setSelected((prev) => [...prev, iso]);
    setActiveDay(null);
  }

  const { run: confirmAll, pending: confirming } = useAsyncAction(async () => {
    try {
      const res = await fetch("/api/sessions/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, slots: selected }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not book these sessions.");
        // Refetch availability: a slot may have just been taken by someone
        // else, and (before Fix 1) every retry of a multi-session package
        // failed identically — either way, stale picks against stale
        // availability just reproduce the same failure on retry.
        setSelected([]);
        await loadSlots();
        return;
      }
      toast.success("All sessions booked.");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not book these sessions.");
    }
  });
  const isPending = confirming || isRefreshing;

  if (loading) {
    return <div className="bg-pz-surface-container-lowest rounded-xl shadow-card p-8 text-center font-body text-pz-on-surface-variant">Loading available times…</div>;
  }

  return (
    <div className="bg-pz-surface-container-lowest rounded-xl shadow-card max-md:overflow-clip md:overflow-hidden flex flex-col">
      <div className="border-b border-pz-outline-variant p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="font-headline font-bold text-pz-on-surface">Schedule Your Sessions</h2>
          <p className="font-body text-sm text-pz-on-surface-variant mt-1">
            {mentorName} — {packageName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-headline font-bold text-sm text-pz-primary">
            Session {Math.min(sessionIndex + 1, sessionsNeeded)} of {sessionsNeeded}
          </span>
          <div className="flex gap-1.5">
            {Array.from({ length: sessionsNeeded }, (_, i) => (
              <div key={i} className={`w-8 h-2 rounded-full ${i < selected.length ? "bg-pz-primary" : "bg-pz-surface-container-highest"}`} />
            ))}
          </div>
        </div>
      </div>

      {done ? (
        <div className="p-4 md:p-8 flex flex-col gap-4">
          <h3 className="font-headline font-bold text-pz-on-surface">Review your sessions</h3>
          <ul className="flex flex-col gap-2">
            {selected.map((iso, i) => (
              <li key={iso} className="flex items-center gap-2 font-body text-sm text-pz-on-surface">
                <span className="font-headline font-bold text-pz-primary">Session {i + 1}:</span>
                {dayFmtLong.format(new Date(iso))} at {timeFmt.format(new Date(iso))}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-3 max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
            <Button
              type="button"
              variant="bare"
              size="bare"
              onClick={() => setSelected([])}
              disabled={isPending}
              className="px-6 py-2.5 max-md:min-h-11 max-md:flex-1 rounded-lg border-2 border-pz-outline-variant text-pz-on-surface font-headline font-bold hover:bg-pz-surface-container-low transition-colors"
            >
              Start Over
            </Button>
            <Button
              type="button"
              variant="bare"
              size="bare"
              loading={isPending}
              onClick={() => confirmAll()}
              className="px-6 py-2.5 max-md:min-h-11 max-md:flex-1 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold shadow-md hover:bg-pz-on-primary-container transition-all"
            >
              {isPending ? "Booking…" : "Confirm All Sessions"}
            </Button>
          </div>
        </div>
      ) : days.length === 0 ? (
        <div className="p-8 text-center font-body text-pz-on-surface-variant">
          No available slots in the next 30 days — check back later or contact support.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-pz-outline-variant">
          <div className="p-6">
            <h3 className="font-headline font-bold text-pz-on-surface mb-4">Pick a day</h3>
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setActiveDay(day)}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-colors text-left ${
                    day === currentDay
                      ? "border-pz-primary bg-pz-primary/10 text-pz-primary font-bold"
                      : "border-pz-outline-variant text-pz-on-surface hover:bg-pz-surface-container-low"
                  }`}
                >
                  <span className="font-body text-sm">{dayFmtLong.format(new Date(byDay.get(day)![0]))}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="p-6">
            <h3 className="font-headline font-bold text-pz-on-surface mb-4">Available times</h3>
            {currentDay ? (
              <div className="grid grid-cols-2 gap-3">
                {byDay.get(currentDay)!.map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => pickSlot(iso)}
                    className="border border-pz-outline-variant rounded-lg py-3 font-headline font-bold text-pz-on-surface hover:border-pz-primary hover:bg-pz-primary/5 transition-all"
                  >
                    {timeFmt.format(new Date(iso))}
                  </button>
                ))}
              </div>
            ) : (
              <p className="font-body text-sm text-pz-on-surface-variant flex items-center gap-1">
                <ChevronLeft className="w-4 h-4" /> Pick a day first
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
