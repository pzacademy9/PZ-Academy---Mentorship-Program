import { describe, it, expect } from "vitest";
import {
  buildPortalBatch,
  buildPortalCards,
  type PortalBatchInput,
  type PortalSessionInput,
} from "@/lib/progress/portal-build";

const NOW = new Date("2026-03-10T12:00:00Z");
const day = (n: number) => `2026-03-${String(n).padStart(2, "0")}T10:00:00Z`;

const sess = (n: number, startsAt: string, extra: Partial<PortalSessionInput> = {}): PortalSessionInput => ({
  id: `s${n}`,
  number: n,
  title: `Class ${n}`,
  startsAt,
  audience: null,
  quizMax: null,
  ...extra,
});

const person = (i: number, name = "Sample Name") => ({
  id: `p${i}`,
  pzId: `Name-${String(i).padStart(4, "0")}`,
  displayName: `${name}`,
});

const FULL = "Live - Full Course";

function batch(over: Partial<PortalBatchInput> = {}): PortalBatchInput {
  return {
    pageId: "b1",
    title: "Sample Batch",
    slug: "sample-batch",
    kind: "course",
    minPct: 75,
    sessions: [sess(1, day(1)), sess(2, day(2)), sess(3, day(3)), sess(4, day(20))],
    people: [person(1)],
    regs: [{ personId: "p1", mode: "live", optionLabel: FULL }],
    marks: [],
    scores: [],
    now: NOW,
    ...over,
  };
}

describe("buildPortalBatch attendance", () => {
  it("live student with 2 of 3 held classes", () => {
    const v = buildPortalBatch(
      batch({
        marks: [
          { sessionId: "s1", personId: "p1" },
          { sessionId: "s3", personId: "p1" },
        ],
      }),
    );
    const row = v.attendance[0];
    expect(row.attended).toBe(2);
    expect(row.held).toBe(3);
    expect(row.pct).toBe(67);
    expect(row.meetsMin).toBe(false);
    expect(row.classes.map((c) => c.state)).toEqual(["present", "absent", "present", "upcoming"]);
  });

  it("module scoping excludes classes for other modules", () => {
    const v = buildPortalBatch(
      batch({
        sessions: [
          sess(1, day(1), { audience: { mode: "live", modules: [1] } }),
          sess(2, day(2), { audience: { mode: "live", modules: [2] } }),
        ],
        regs: [{ personId: "p1", mode: "live", optionLabel: "Live - Modules: M2" }],
      }),
    );
    expect(v.attendance[0].classes.map((c) => c.number)).toEqual([2]);
    expect(v.attendance[0].held).toBe(1);
  });

  it("recorded student is not tracked", () => {
    const v = buildPortalBatch(
      batch({ regs: [{ personId: "p1", mode: "recorded", optionLabel: "Recorded - Full Course" }] }),
    );
    const row = v.attendance[0];
    expect(row.mode).toBe("recorded");
    expect(row.attended).toBeNull();
    expect(row.held).toBeNull();
    expect(row.pct).toBeNull();
    expect(row.meetsMin).toBeNull();
    expect(row.classes).toEqual([]);
  });

  it("person with live and recorded reg appears once as live", () => {
    const v = buildPortalBatch(
      batch({
        regs: [
          { personId: "p1", mode: "recorded", optionLabel: "Recorded - Full Course" },
          { personId: "p1", mode: "live", optionLabel: FULL },
        ],
      }),
    );
    expect(v.attendance).toHaveLength(1);
    expect(v.attendance[0].mode).toBe("live");
  });

  it("no held class gives null pct and meetsMin false", () => {
    const v = buildPortalBatch(batch({ sessions: [sess(1, day(25))] }));
    expect(v.attendance[0].pct).toBeNull();
    expect(v.attendance[0].meetsMin).toBe(false);
  });

  it("attendance sorted by first name then PZ ID; same first name gives two rows", () => {
    const v = buildPortalBatch(
      batch({
        people: [person(3, "Zed Name"), person(2, "Sample Name"), person(1, "Sample Other")],
        regs: ["p1", "p2", "p3"].map((id) => ({ personId: id, mode: "live" as const, optionLabel: FULL })),
      }),
    );
    expect(v.attendance.map((r) => [r.firstName, r.pzId])).toEqual([
      ["Sample", "Name-0001"],
      ["Sample", "Name-0002"],
      ["Zed", "Name-0003"],
    ]);
  });
});

describe("buildPortalBatch results", () => {
  const people3 = [person(1, "Cee Name"), person(2, "Bee Name"), person(3, "Aye Name"), person(4, "Rec Name")];
  const liveRegs = ["p1", "p2", "p3"].map((id) => ({ personId: id, mode: "live" as const, optionLabel: FULL }));

  it("competition ranking with a recorded student unranked", () => {
    const v = buildPortalBatch(
      batch({
        people: people3,
        regs: [...liveRegs, { personId: "p4", mode: "recorded", optionLabel: "Recorded - Full Course" }],
        scores: [
          { sessionId: "s1", personId: "p1", score: 10 },
          { sessionId: "s1", personId: "p2", score: 10 },
          { sessionId: "s1", personId: "p3", score: 5 },
          { sessionId: "s1", personId: "p4", score: 99 },
        ],
      }),
    );
    expect(v.overall.map((r) => [r.firstName, r.rank, r.score, r.mode])).toEqual([
      ["Bee", 1, 10, "live"],
      ["Cee", 1, 10, "live"],
      ["Aye", 3, 5, "live"],
      ["Rec", null, 99, "recorded"],
    ]);
    expect(v.perClass.s1.map((r) => r.rank)).toEqual([1, 1, 3, null]);
  });

  it("overall sums per person and omits people with no score", () => {
    const v = buildPortalBatch(
      batch({
        people: people3,
        regs: liveRegs,
        scores: [
          { sessionId: "s1", personId: "p1", score: 4 },
          { sessionId: "s2", personId: "p1", score: 6 },
        ],
      }),
    );
    expect(v.overall).toHaveLength(1);
    expect(v.overall[0].score).toBe(10);
    expect(v.attendance).toHaveLength(3);
  });

  it("ignores scores of people with no reg in the batch", () => {
    const v = buildPortalBatch(
      batch({
        people: [...people3],
        scores: [{ sessionId: "s1", personId: "p3", score: 50 }],
      }),
    );
    expect(v.overall).toEqual([]);
    expect(v.perClass.s1).toEqual([]);
  });
});

describe("buildPortalCards", () => {
  it("counts distinct registered people and held classes, orders newest first", () => {
    const a = batch({
      title: "Older",
      slug: "older",
      sessions: [sess(1, day(1)), sess(2, day(2))],
      people: [person(1), person(2)],
      regs: [
        { personId: "p1", mode: "live", optionLabel: FULL },
        { personId: "p1", mode: "recorded", optionLabel: "Recorded - Full Course" },
        { personId: "p2", mode: "live", optionLabel: FULL },
      ],
    });
    const b = batch({
      title: "Newer",
      slug: "newer",
      sessions: [sess(1, day(5)), sess(2, day(20))],
    });
    const cards = buildPortalCards([a, b]);
    expect(cards.map((c) => c.slug)).toEqual(["newer", "older"]);
    expect(cards[1]).toMatchObject({ students: 2, classesHeld: 2, classesTotal: 2, lastClassAt: day(2) });
    expect(cards[0]).toMatchObject({ students: 1, classesHeld: 1, classesTotal: 2 });
  });

  it("passes the chosen cover through, else null", () => {
    const [a, b] = buildPortalCards([batch({ slug: "a", coverUrl: "https://x.test/a.jpg" }), batch({ slug: "b", sessions: [] })]);
    expect([a.coverUrl, b.coverUrl].sort()).toEqual(["https://x.test/a.jpg", null].sort());
  });

  it("sets the state chip: completed, recorded, else live", () => {
    const live = batch({ slug: "l", sessions: [sess(1, day(1)), sess(2, day(20))] });
    const done = batch({ slug: "d", sessions: [sess(1, day(1)), sess(2, day(2))] });
    const closed = batch({ slug: "c", closed: true, sessions: [sess(1, day(1)), sess(2, day(20))] });
    const rec = batch({
      slug: "r",
      sessions: [sess(1, day(1)), sess(2, day(20))],
      regs: [{ personId: "p1", mode: "recorded", optionLabel: "Recorded - Full Course" }],
    });
    const mixed = batch({
      slug: "m",
      sessions: [sess(1, day(1)), sess(2, day(20))],
      people: [person(1), person(2)],
      regs: [
        { personId: "p1", mode: "recorded", optionLabel: "Recorded - Full Course" },
        { personId: "p2", mode: "live", optionLabel: FULL },
      ],
    });
    const none = batch({ slug: "n", sessions: [], regs: [], people: [] });
    const by = Object.fromEntries(buildPortalCards([live, done, closed, rec, mixed, none]).map((c) => [c.slug, c.state]));
    expect(by).toEqual({ l: "live", d: "completed", c: "completed", r: "recorded", m: "live", n: "live" });
  });
});
