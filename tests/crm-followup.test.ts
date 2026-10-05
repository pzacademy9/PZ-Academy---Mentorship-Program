import { describe, it, expect } from "vitest";
import {
  nextFollowupFor,
  nextFollowupAfterSend,
  FOLLOWUP_HOUR_CHOICES,
  FOLLOWUP_CHOICES,
  DEFAULT_FOLLOWUP_HOURS,
  isFollowupHours,
  followupLabel,
  rankQueue,
  OUTCOME_KINDS,
  WARM_OUTCOMES,
  isWarmOutcome,
  isDue,
  coldQueueFilter,
} from "@/lib/crm/followup";

const now = new Date("2026-10-05T10:00:00.000Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("nextFollowupFor", () => {
  it("replied is due in 1 day", () => {
    expect(nextFollowupFor("replied", now)).toEqual(days(1));
  });
  it("interested is due in 2 days", () => {
    expect(nextFollowupFor("interested", now)).toEqual(days(2));
  });
  it("bought and not_interested clear the follow-up", () => {
    expect(nextFollowupFor("bought", now)).toBeNull();
    expect(nextFollowupFor("not_interested", now)).toBeNull();
  });
  it("a newly claimed contact is due immediately", () => {
    expect(nextFollowupFor("claimed", now)).toEqual(now);
  });
  it("lists the four outcomes", () => {
    expect([...OUTCOME_KINDS]).toEqual(["replied", "interested", "bought", "not_interested"]);
  });
});

describe("rankQueue", () => {
  const item = (id: string, next: string | null, warm = false) => ({
    id,
    next_followup_at: next,
    warm,
  });

  it("drops contacts that are not due yet", () => {
    const out = rankQueue([item("a", "2026-10-06T10:00:00.000Z"), item("b", null)], now);
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("treats a contact due exactly now as due", () => {
    expect(rankQueue([item("a", now.toISOString())], now)).toHaveLength(1);
  });

  it("puts warm contacts before cold ones", () => {
    const out = rankQueue(
      [item("cold", "2026-10-01T00:00:00.000Z"), item("warm", "2026-10-04T00:00:00.000Z", true)],
      now,
    );
    expect(out.map((i) => i.id)).toEqual(["warm", "cold"]);
  });

  it("orders by oldest due first within a group, null follow-up counting as oldest", () => {
    const out = rankQueue(
      [
        item("c", "2026-10-03T00:00:00.000Z"),
        item("a", null),
        item("b", "2026-10-02T00:00:00.000Z"),
      ],
      now,
    );
    expect(out.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("is stable on ties by id and does not mutate the input", () => {
    const input = [item("z", null), item("m", null)];
    const copy = [...input];
    expect(rankQueue(input, now).map((i) => i.id)).toEqual(["m", "z"]);
    expect(input).toEqual(copy);
  });
});

describe("B2: follow-up after a send (the person chooses)", () => {
  const hoursLater = (h: number) => new Date(now.getTime() + h * 3_600_000);
  it("offers 8 hours, 1 day, 2 days and 3 days, defaulting to 1 day", () => {
    expect([...FOLLOWUP_HOUR_CHOICES]).toEqual([8, 24, 48, 72]);
    expect(DEFAULT_FOLLOWUP_HOURS).toBe(24);
    expect(FOLLOWUP_CHOICES.map((c) => c.label)).toEqual(["8 hours", "1 day", "2 days", "3 days"]);
    expect(FOLLOWUP_CHOICES.map((c) => c.hours)).toEqual([8, 24, 48, 72]);
    expect(followupLabel(24)).toBe("1 day");
  });
  it("brings the contact back after exactly the chosen hours", () => {
    expect(nextFollowupAfterSend(now, 8)).toEqual(hoursLater(8));
    expect(nextFollowupAfterSend(now, 24)).toEqual(days(1));
    expect(nextFollowupAfterSend(now, 48)).toEqual(days(2));
    expect(nextFollowupAfterSend(now, 72)).toEqual(days(3));
  });
  it("uses 1 day when nothing (or something unknown) is passed", () => {
    expect(nextFollowupAfterSend(now)).toEqual(days(1));
    expect(nextFollowupAfterSend(now, 5)).toEqual(days(1));
    expect(nextFollowupAfterSend(now, Number.NaN)).toEqual(days(1));
  });
  it("only the four listed values are valid", () => {
    for (const h of [8, 24, 48, 72]) expect(isFollowupHours(h)).toBe(true);
    for (const h of [0, 12, 24.5, 168, "24", null, undefined]) expect(isFollowupHours(h)).toBe(false);
  });
  it("outcome-driven follow-ups are unchanged", () => {
    expect(nextFollowupFor("replied", now)).toEqual(days(1));
    expect(nextFollowupFor("interested", now)).toEqual(days(2));
    expect(nextFollowupFor("bought", now)).toBeNull();
    expect(nextFollowupFor("not_interested", now)).toBeNull();
  });
});

describe("B2: isDue", () => {
  it("a past or present follow-up date is due, a future one is not", () => {
    expect(isDue({ next_followup_at: days(-1).toISOString(), last_outcome: "replied" }, now)).toBe(true);
    expect(isDue({ next_followup_at: now.toISOString(), last_outcome: null }, now)).toBe(true);
    expect(isDue({ next_followup_at: days(1).toISOString(), last_outcome: null }, now)).toBe(false);
  });
  it("no date is due only when there is no outcome yet", () => {
    expect(isDue({ next_followup_at: null, last_outcome: null }, now)).toBe(true);
    expect(isDue({ next_followup_at: null }, now)).toBe(true);
    expect(isDue({ next_followup_at: null, last_outcome: "bought" }, now)).toBe(false);
    expect(isDue({ next_followup_at: null, last_outcome: "not_interested" }, now)).toBe(false);
  });
  it("an admin re-assignment (date set) brings a closed contact back", () => {
    expect(isDue({ next_followup_at: now.toISOString(), last_outcome: "not_interested" }, now)).toBe(true);
  });
});

describe("B2: warmth", () => {
  it("only Replied and Interested are warm", () => {
    expect([...WARM_OUTCOMES]).toEqual(["replied", "interested"]);
    expect(isWarmOutcome("replied")).toBe(true);
    expect(isWarmOutcome("interested")).toBe(true);
    expect(isWarmOutcome("bought")).toBe(false);
    expect(isWarmOutcome(null)).toBe(false);
    expect(isWarmOutcome(undefined)).toBe(false);
  });
});

describe("B2: rankQueue drops closed contacts", () => {
  it("filters Bought / Not interested with no date", () => {
    const items = [
      { id: "a", next_followup_at: null, warm: false, last_outcome: "bought" },
      { id: "b", next_followup_at: null, warm: false, last_outcome: null },
      { id: "c", next_followup_at: null, warm: false, last_outcome: "not_interested" },
    ];
    expect(rankQueue(items, now).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("B2: coldQueueFilter", () => {
  it("matches new contacts with no date, new contacts that are due, and closed contacts given a due date", () => {
    expect(coldQueueFilter("2026-10-05T10:00:00.000Z")).toBe(
      "and(last_outcome.is.null,next_followup_at.is.null)," +
        "and(last_outcome.is.null,next_followup_at.lte.2026-10-05T10:00:00.000Z)," +
        "and(last_outcome.in.(bought,not_interested),next_followup_at.lte.2026-10-05T10:00:00.000Z)",
    );
  });
});
