// Follow-up scheduling rules for the Sales Workspace. Pure: no I/O, `now` is injected.

export type OutcomeKind = "replied" | "interested" | "bought" | "not_interested";

export const OUTCOME_KINDS: readonly OutcomeKind[] = [
  "replied",
  "interested",
  "bought",
  "not_interested",
];

const DAY_MS = 86_400_000;

const HOUR_MS = 3_600_000;

/** How long after a send the person can ask to have the contact brought back (owner ruling, decision D1). */
export const FOLLOWUP_HOUR_CHOICES = [8, 24, 48, 72] as const;
export type FollowupHours = (typeof FOLLOWUP_HOUR_CHOICES)[number];
export const DEFAULT_FOLLOWUP_HOURS: FollowupHours = 24;

/** Plain-words labels for the "Bring them back in" chips, in display order. */
export const FOLLOWUP_CHOICES: readonly { hours: FollowupHours; label: string }[] = [
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "1 day" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
];

export function isFollowupHours(value: unknown): value is FollowupHours {
  return typeof value === "number" && (FOLLOWUP_HOUR_CHOICES as readonly number[]).includes(value);
}

export function followupLabel(hours: FollowupHours): string {
  return FOLLOWUP_CHOICES.find((c) => c.hours === hours)!.label;
}

/**
 * When a contact who was just messaged comes back to Today if nobody taps an outcome:
 * now + the hours the person picked. An unknown value falls back to the default, so a bad
 * caller can never make the data layer throw after a send was already counted.
 */
export function nextFollowupAfterSend(now: Date, hours: number = DEFAULT_FOLLOWUP_HOURS): Date {
  const h = isFollowupHours(hours) ? hours : DEFAULT_FOLLOWUP_HOURS;
  return new Date(now.getTime() + h * HOUR_MS);
}

/** When a contact is next due after an outcome or a claim. null = no follow-up. (After a send: nextFollowupAfterSend.) */
export function nextFollowupFor(kind: OutcomeKind | "claimed", now: Date): Date | null {
  switch (kind) {
    case "replied":
      return new Date(now.getTime() + DAY_MS);
    case "interested":
      return new Date(now.getTime() + 2 * DAY_MS);
    case "claimed":
      return new Date(now.getTime());
    case "bought":
    case "not_interested":
      return null;
  }
}

/** Outcomes that mean a two-way conversation is going: ranked first in Today (spec 5.8). */
export const WARM_OUTCOMES: readonly OutcomeKind[] = ["replied", "interested"];

export function isWarmOutcome(lastOutcome: string | null | undefined): boolean {
  return lastOutcome != null && (WARM_OUTCOMES as readonly string[]).includes(lastOutcome);
}

/**
 * Due for Today: a follow-up date that has passed, or no date at all for a contact
 * with no outcome yet. Bought and Not interested clear the date, and must not come
 * straight back, so "no date" alone is not enough.
 */
export function isDue(item: { next_followup_at: string | null; last_outcome?: string | null }, now: Date): boolean {
  if (item.next_followup_at === null) return (item.last_outcome ?? null) === null;
  return Date.parse(item.next_followup_at) <= now.getTime();
}

export type QueueItem = { id: string; next_followup_at: string | null; warm: boolean; last_outcome?: string | null };

/** Today queue: only due contacts, warm first, then oldest due first, then id for stability. */
export function rankQueue<T extends QueueItem>(items: T[], now: Date): T[] {
  const dueAt = (i: T) => (i.next_followup_at === null ? 0 : Date.parse(i.next_followup_at));
  return items
    .filter((i) => isDue(i, now))
    .sort((a, b) => {
      if (a.warm !== b.warm) return a.warm ? -1 : 1;
      const d = dueAt(a) - dueAt(b);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** PostgREST or() body for the cold half of Today (no outcome yet, or closed but re-dated by an admin). */
export function coldQueueFilter(nowIso: string): string {
  return [
    "and(last_outcome.is.null,next_followup_at.is.null)",
    `and(last_outcome.is.null,next_followup_at.lte.${nowIso})`,
    `and(last_outcome.in.(bought,not_interested),next_followup_at.lte.${nowIso})`,
  ].join(",");
}
