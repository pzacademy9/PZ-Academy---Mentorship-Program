import { describe, it, expect } from "vitest";
import { nextFollowupFor, rankQueue, OUTCOME_KINDS } from "@/lib/crm/followup";

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
