// Pure: when a webinar stops being "upcoming" on the website.

/** A webinar with a date counts as recorded this many hours after it starts (owner's default, 2026-11-04). */
export const RECORDED_AFTER_HOURS = 3;

/**
 * Upcoming = still open AND not more than RECORDED_AFTER_HOURS past its start.
 * Closing it by hand still works; a webinar without a date behaves as before.
 */
export function isUpcomingWebinar(w: { status: string; startsAt?: string | null }, nowMs: number): boolean {
  if (w.status !== "open") return false;
  if (!w.startsAt) return true;
  const t = Date.parse(w.startsAt);
  if (Number.isNaN(t)) return true;
  return nowMs < t + RECORDED_AFTER_HOURS * 3_600_000;
}
