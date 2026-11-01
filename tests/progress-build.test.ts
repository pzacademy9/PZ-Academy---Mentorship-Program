// tests/progress-build.test.ts
import { describe, it, expect } from "vitest";
import { buildProgress, type BatchInput, type ProgressInput } from "@/lib/progress/build";

const NOW = new Date("2026-11-01T12:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 15, 0, 0)).toISOString(); // Oct n, 2026

const sess = (id: string, number: number, startsAt: string, over: Record<string, unknown> = {}) => ({
  id,
  number,
  title: `Class ${number}`,
  startsAt,
  audience: null,
  quizMax: null,
  ...over,
});

const batch = (over: Partial<BatchInput> = {}): BatchInput => ({
  pageId: "p1",
  title: "Sample Batch",
  slug: "sample-batch",
  kind: "course",
  minPct: 75,
  mode: "live",
  optionLabels: ["Live - Full Course"],
  sessions: [],
  marks: {},
  myScores: {},
  liveScores: {},
  ...over,
});

const input = (batches: BatchInput[]): ProgressInput => ({
  person: { displayName: "Sample Name", pzId: "Sample-0000" },
  batches,
  now: NOW,
});

describe("buildProgress", () => {
  it("uses the first name only, never the surname", () => {
    const out = buildProgress(input([batch()]));
    expect(out.firstName).toBe("Sample");
    expect(out.pzId).toBe("Sample-0000");
    expect(JSON.stringify(out)).not.toMatch(/\bName\b/);
    expect(JSON.stringify(out)).not.toContain("Sample Name");
  });

  it("counts only started classes and labels how each was marked", () => {
    const out = buildProgress(
      input([
        batch({
          sessions: [sess("s1", 1, day(1)), sess("s2", 2, day(2)), sess("s3", 3, day(3)), sess("s4", 4, "2026-12-01T10:00:00Z")],
          marks: { s1: "personal", s2: "admin" },
        }),
      ]),
    );
    const att = out.groups[0].batches[0].attendance!;
    expect(att.held).toBe(3);
    expect(att.attended).toBe(2);
    expect(att.pct).toBe(67);
    expect(att.minPct).toBe(75);
    expect(att.meetsMin).toBe(false);
    expect(att.rows.map((r) => [r.number, r.state, r.how])).toEqual([
      [1, "present", "check-in"],
      [2, "present", "admin"],
      [3, "absent", null],
      [4, "upcoming", null],
    ]);
  });

  it("a shared-link mark is a check-in", () => {
    const out = buildProgress(input([batch({ sessions: [sess("s1", 1, day(1))], marks: { s1: "shared" } })]));
    expect(out.groups[0].batches[0].attendance!.rows[0].how).toBe("check-in");
  });

  it("a class with no audience counts for everyone, even a module student", () => {
    const out = buildProgress(
      input([batch({ optionLabels: ["Live - Modules: M2"], sessions: [sess("s1", 1, day(1), { audience: null })] })]),
    );
    expect(out.groups[0].batches[0].attendance!.held).toBe(1);
  });

  it("filters classes by module", () => {
    const sessions = [
      sess("s1", 1, day(1), { audience: { mode: "live", modules: [1] } }),
      sess("s2", 2, day(2), { audience: { mode: "live", modules: [2] } }),
      sess("s3", 3, day(3), { audience: { mode: "any", modules: "all" } }),
    ];
    const mod2 = buildProgress(input([batch({ optionLabels: ["Live - Modules: M2"], sessions })]));
    expect(mod2.groups[0].batches[0].attendance!.rows.map((r) => r.number)).toEqual([2, 3]);
    const full = buildProgress(input([batch({ optionLabels: ["Live - Full Course"], sessions })]));
    expect(full.groups[0].batches[0].attendance!.rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("counts a class when ANY of several live options in the batch matches", () => {
    const sessions = [
      sess("s1", 1, day(1), { audience: { mode: "live", modules: [1] } }),
      sess("s2", 2, day(2), { audience: { mode: "live", modules: [2] } }),
      sess("s3", 3, day(3), { audience: { mode: "live", modules: [3] } }),
    ];
    const out = buildProgress(input([batch({ optionLabels: ["Live - Modules: M1", "Live - Modules: M3"], sessions })]));
    expect(out.groups[0].batches[0].attendance!.rows.map((r) => r.number)).toEqual([1, 3]);
  });

  it("does not count a class when the option label cannot be read", () => {
    const out = buildProgress(
      input([batch({ optionLabels: ["Something odd"], sessions: [sess("s1", 1, day(1), { audience: { mode: "any", modules: "all" } })] })]),
    );
    expect(out.groups[0].batches[0].attendance!.held).toBe(0);
    expect(out.groups[0].batches[0].attendance!.pct).toBeNull();
  });

  it("recorded students get no attendance and no rank, but see their scores", () => {
    const out = buildProgress(
      input([
        batch({
          mode: "recorded",
          optionLabels: ["Recorded - Full Course"],
          sessions: [sess("s1", 1, day(1), { quizMax: 100 })],
          myScores: { s1: 80 },
          liveScores: { s1: [90, 80, 70] },
        }),
      ]),
    );
    const b = out.groups[0].batches[0];
    expect(b.mode).toBe("recorded");
    expect(b.attendance).toBeNull();
    expect(b.results.rows).toEqual([
      { number: 1, title: "Class 1", startsAt: day(1), score: 80, max: 100, rank: null, of: null },
    ]);
    expect(b.results.total).toBe(80);
  });

  it("ties share a rank", () => {
    const out = buildProgress(
      input([
        batch({
          sessions: [sess("s1", 1, day(1), { quizMax: 10 })],
          myScores: { s1: 8 },
          liveScores: { s1: [10, 8, 8, 5] },
        }),
      ]),
    );
    const row = out.groups[0].batches[0].results.rows[0];
    expect(row.rank).toBe(2);
    expect(row.of).toBe(4);
    const tied = buildProgress(
      input([batch({ sessions: [sess("s1", 1, day(1))], myScores: { s1: 10 }, liveScores: { s1: [10, 10, 5] } })]),
    );
    expect(tied.groups[0].batches[0].results.rows[0].rank).toBe(1);
    const below = buildProgress(
      input([batch({ sessions: [sess("s1", 1, day(1))], myScores: { s1: 5 }, liveScores: { s1: [10, 10, 5] } })]),
    );
    expect(below.groups[0].batches[0].results.rows[0].rank).toBe(3);
  });

  it("lists results only for classes with a saved score, and sums them", () => {
    const out = buildProgress(
      input([
        batch({
          sessions: [sess("s1", 1, day(1)), sess("s2", 2, day(2)), sess("s3", 3, day(3))],
          myScores: { s3: 5, s1: 7 },
          liveScores: { s1: [7], s3: [5] },
        }),
      ]),
    );
    const r = out.groups[0].batches[0].results;
    expect(r.rows.map((x) => x.number)).toEqual([1, 3]);
    expect(r.total).toBe(12);
  });

  it("groups by kind in order and hides empty groups", () => {
    const out = buildProgress(
      input([
        batch({ pageId: "w", kind: "webinar", title: "Web", slug: "web", sessions: [sess("w1", 1, day(5))] }),
        batch({ pageId: "c", kind: "course", title: "Course", slug: "course", sessions: [sess("c1", 1, day(2))] }),
      ]),
    );
    expect(out.groups.map((g) => g.kind)).toEqual(["course", "webinar"]);
  });

  it("orders batches newest first by latest class and flags only the newest as latest", () => {
    const out = buildProgress(
      input([
        batch({ pageId: "a", slug: "old", title: "Old", sessions: [sess("a1", 1, day(1))] }),
        batch({ pageId: "b", slug: "new", title: "New", sessions: [sess("b1", 1, day(9))] }),
        batch({ pageId: "c", slug: "empty", title: "Empty", sessions: [] }),
        batch({ pageId: "d", slug: "web", kind: "webinar", title: "Web", sessions: [sess("d1", 1, day(3))] }),
      ]),
    );
    const course = out.groups.find((g) => g.kind === "course")!;
    expect(course.batches.map((b) => b.slug)).toEqual(["new", "old", "empty"]);
    expect(course.batches.map((b) => b.latest)).toEqual([true, false, false]);
    expect(out.groups.find((g) => g.kind === "webinar")!.batches[0].latest).toBe(false);
  });

  it("returns no groups when there are no batches", () => {
    expect(buildProgress(input([])).groups).toEqual([]);
  });
});
