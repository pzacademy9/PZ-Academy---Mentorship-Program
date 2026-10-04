// Follow-up scheduling rules for the Sales Workspace. Pure: no I/O, `now` is injected.

export type OutcomeKind = "replied" | "interested" | "bought" | "not_interested";

export const OUTCOME_KINDS: readonly OutcomeKind[] = [
  "replied",
  "interested",
  "bought",
  "not_interested",
];

const DAY_MS = 86_400_000;

/** When a contact is next due after an outcome (or after being claimed). null = no follow-up. */
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

export type QueueItem = { id: string; next_followup_at: string | null; warm: boolean };

/** Today queue: only due contacts, warm first, then oldest due first, then id for stability. */
export function rankQueue<T extends QueueItem>(items: T[], now: Date): T[] {
  const dueAt = (i: T) => (i.next_followup_at === null ? 0 : Date.parse(i.next_followup_at));
  return items
    .filter((i) => i.next_followup_at === null || Date.parse(i.next_followup_at) <= now.getTime())
    .sort((a, b) => {
      if (a.warm !== b.warm) return a.warm ? -1 : 1;
      const d = dueAt(a) - dueAt(b);
      if (d !== 0) return d;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
