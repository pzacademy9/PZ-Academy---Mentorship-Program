import type { MentorPackage } from "@/lib/data/mentors";

export interface WeeklyRange {
  day: number; // 0 = Sunday .. 6 = Saturday, in the mentor's own timezone
  start: string; // "HH:MM", 24h
  end: string; // "HH:MM", 24h, exclusive
}

export interface AvailabilityPattern {
  weeklyRanges: WeeklyRange[];
}

export interface SlotComputationInput {
  availability: AvailabilityPattern;
  timezone: string; // IANA, e.g. "Asia/Karachi"
  durationMinutes: number;
  leadTimeHours: number;
  bookedSlots: string[]; // ISO timestamps already occupied for this mentor
  now: Date;
  daysAhead?: number;
}

/**
 * The package-count lookup the booking flow needs before a student can pick
 * slots. Falls back to 1 (not an error) when the booking's frozen
 * package_name no longer matches anything in the mentor's current packages
 * array — the package may have been renamed/removed by an admin edit since
 * the booking was made. Mirrored in SQL inside book_mentorship_sessions
 * (migration 0031) since Postgres can't call this function directly; keep
 * both in sync if this logic ever changes.
 */
export function resolveSessionsTotal(packageName: string, packages: MentorPackage[]): number {
  const match = packages.find((p) => p.name === packageName);
  return match?.sessions ?? 1;
}

/**
 * Returns the mentor-local weekday (0-6) and "HH:MM" time-of-day a given
 * UTC instant falls on, using Intl.DateTimeFormat rather than a date
 * library — this repo has none installed and doesn't need one for this.
 */
function localWeekdayAndTime(instant: Date, timezone: string): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { day: WEEKDAYS.indexOf(weekdayShort), time: `${hour}:${minute}` };
}

/**
 * Generates candidate slot start times for the next `daysAhead` days
 * (default 14), filtered to the mentor's weekly pattern, minus anything in
 * `bookedSlots`, minus anything inside `leadTimeHours` of `now`. Walks in
 * `durationMinutes` increments in UTC and re-derives the mentor-local
 * weekday/time for each candidate — correct across DST boundaries in
 * `timezone` without needing a date library, since Intl does the timezone
 * math.
 */
export function computeAvailableSlots(input: SlotComputationInput): string[] {
  const { availability, timezone, durationMinutes, leadTimeHours, bookedSlots, now, daysAhead = 14 } = input;

  if (availability.weeklyRanges.length === 0) return [];

  const booked = new Set(bookedSlots);
  const earliest = new Date(now.getTime() + leadTimeHours * 60 * 60 * 1000);
  const horizon = new Date(now.getTime() + (daysAhead + 1) * 24 * 60 * 60 * 1000);
  const stepMs = durationMinutes * 60 * 1000;

  const rangesByDay = new Map<number, WeeklyRange[]>();
  for (const range of availability.weeklyRanges) {
    const list = rangesByDay.get(range.day) ?? [];
    list.push(range);
    rangesByDay.set(range.day, list);
  }

  const slots: string[] = [];
  // Start scanning from the top of the current UTC hour so results are
  // stable within a test/render pass, then walk forward in duration steps.
  let cursor = new Date(Math.floor(now.getTime() / stepMs) * stepMs);

  while (cursor < horizon) {
    if (cursor >= earliest) {
      const { day, time } = localWeekdayAndTime(cursor, timezone);
      const dayRanges = rangesByDay.get(day) ?? [];
      const withinRange = dayRanges.some((r) => time >= r.start && time < r.end);

      if (withinRange) {
        const iso = cursor.toISOString();
        if (!booked.has(iso)) slots.push(iso);
      }
    }
    cursor = new Date(cursor.getTime() + stepMs);
  }

  return slots;
}
