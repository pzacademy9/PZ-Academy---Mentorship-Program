import { describe, it, expect } from "vitest";
import type { ProgressBatch } from "@/lib/progress/build";
import type { PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";
import { boardMax } from "@/lib/progress/leaderboard";
import {
  attendanceRing,
  badgesFor,
  gapText,
  ledgerRows,
  nextClassNumber,
  scoreMax,
  shareProgressHref,
  standingFor,
} from "@/lib/progress/my-progress";

// Fake people only.
const live = (name: string, pzId: string, score: number, rank: number): PortalResultRow => ({ name, pzId, mode: "live", score, rank });
const rec = (name: string, pzId: string, score: number): PortalResultRow => ({ name, pzId, mode: "recorded", score, rank: null });

function view(over: Partial<PortalBatchView> = {}): PortalBatchView {
  return {
    title: "Sample Batch",
    slug: "sample-batch",
    kind: "course",
    minPct: 75,
    state: "live",
    coverUrl: null,
    students: 5,
    classesHeld: 2,
    sessions: [
      { id: "s1", number: 1, title: "One", quizMax: 100 },
      { id: "s2", number: 2, title: "Two", quizMax: 100 },
    ],
    attendance: [],
    overall: [
      live("Aaa", "Aaa-0001", 190, 1),
      live("Bbb", "Bbb-0002", 150, 2),
      live("Ccc", "Ccc-0003", 150, 2),
      live("Ddd", "Ddd-0004", 120, 4),
      rec("Eee", "Eee-0005", 200),
    ],
    perClass: { s1: [live("Aaa", "Aaa-0001", 90, 1)], s2: [live("Aaa", "Aaa-0001", 100, 1)] },
    ...over,
  };
}

const batch = (over: Partial<ProgressBatch> = {}): ProgressBatch => ({
  title: "Sample Batch",
  slug: "sample-batch",
  latest: true,
  mode: "live",
  attendance: {
    attended: 2,
    held: 2,
    pct: 100,
    meetsMin: true,
    minPct: 75,
    rows: [
      { number: 1, title: "One", startsAt: "2026-10-01T13:30:00Z", state: "present", how: "check-in" },
      { number: 2, title: "Two", startsAt: "2026-10-08T13:30:00Z", state: "present", how: "admin" },
      { number: 3, title: "Three", startsAt: "2026-12-08T13:30:00Z", state: "upcoming", how: null },
      { number: 4, title: "Four", startsAt: "2026-12-15T13:30:00Z", state: "upcoming", how: null },
    ],
  },
  results: {
    total: 120,
    rows: [
      { number: 1, title: "One", startsAt: "2026-10-01T13:30:00Z", score: 60, max: 100, rank: 4, of: 4 },
      { number: 2, title: "Two", startsAt: "2026-10-08T13:30:00Z", score: 60, max: 100, rank: 3, of: 4 },
    ],
  },
  ...over,
});

describe("standingFor", () => {
  it("live-ranked student: rank, ranked count, gap to the nearest higher score and the board max", () => {
    expect(standingFor(view(), "Ddd-0004")).toEqual({ rank: 4, of: 4, gap: { points: 30, rank: 2 }, max: 200 });
  });
  it("rank 1 has no gap", () => {
    expect(standingFor(view(), "Aaa-0001")).toEqual({ rank: 1, of: 4, gap: null, max: 200 });
  });
  it("recorded student: no rank and no gap, but the max is still known", () => {
    expect(standingFor(view(), "Eee-0005")).toEqual({ rank: null, of: 4, gap: null, max: 200 });
  });
  it("student with no score on the board: no rank", () => {
    expect(standingFor(view(), "Zzz-0009")).toEqual({ rank: null, of: 4, gap: null, max: 200 });
  });
  it("max is unknown when a class with results has no max", () => {
    const v = view({ sessions: [{ id: "s1", number: 1, title: "One", quizMax: null }, { id: "s2", number: 2, title: "Two", quizMax: 100 }] });
    expect(standingFor(v, "Aaa-0001")?.max).toBeNull();
    expect(boardMax(v, "overall")).toBeNull();
    expect(boardMax(v, "s2")).toBe(100);
  });
});

describe("gapText", () => {
  it("states the real gap", () => {
    expect(gapText({ rank: 4, of: 4, gap: { points: 30, rank: 2 }, max: null })).toBe("30 more points to reach #2");
    expect(gapText({ rank: 4, of: 4, gap: { points: 1, rank: 3 }, max: null })).toBe("1 more point to reach #3");
    expect(gapText({ rank: 4, of: 9, gap: { points: 1250, rank: 3 }, max: null })).toBe("1,250 more points to reach #3");
  });
  it("rank 1 is told they lead; no standing or no rank gives nothing", () => {
    expect(gapText({ rank: 1, of: 4, gap: null, max: null })).toBe("You are #1 in this batch");
    expect(gapText({ rank: null, of: 4, gap: null, max: null })).toBeNull();
    expect(gapText(null)).toBeNull();
  });
});

describe("badgesFor", () => {
  it("perfect attendance when every held class was attended", () => {
    expect(badgesFor(batch(), null).map((b) => b.id)).toEqual(["perfect-attendance"]);
  });
  it("no perfect attendance with a missed class or no class held", () => {
    const missed = batch({ attendance: { ...batch().attendance!, attended: 1, pct: 50, meetsMin: false } });
    expect(badgesFor(missed, null)).toEqual([]);
    const none = batch({ attendance: { ...batch().attendance!, attended: 0, held: 0, pct: null } });
    expect(badgesFor(none, null)).toEqual([]);
  });
  it("top 3 only for a live rank of 1 to 3", () => {
    expect(badgesFor(batch(), { rank: 3, of: 9, gap: null, max: null }).map((b) => b.id)).toEqual(["perfect-attendance", "top-3"]);
    expect(badgesFor(batch(), { rank: 4, of: 9, gap: null, max: null }).map((b) => b.id)).toEqual(["perfect-attendance"]);
  });
  it("recorded students get no badges", () => {
    expect(badgesFor(batch({ mode: "recorded", attendance: null }), { rank: null, of: 3, gap: null, max: null })).toEqual([]);
  });
  it("badge text uses real numbers only", () => {
    const [perfect, top] = badgesFor(batch(), { rank: 2, of: 9, gap: null, max: null });
    expect(perfect.detail).toBe("Attended all 2 classes held");
    expect(top.detail).toBe("Rank 2 of 9 in this batch");
  });
});

describe("attendanceRing", () => {
  it("percent and the matching circle dash", () => {
    expect(attendanceRing(batch().attendance)).toEqual({ pct: 100, dash: 1 });
    expect(attendanceRing({ ...batch().attendance!, attended: 1, pct: 50 })).toEqual({ pct: 50, dash: 0.5 });
  });
  it("nothing to draw without held classes or for recorded students", () => {
    expect(attendanceRing({ ...batch().attendance!, held: 0, attended: 0, pct: null })).toBeNull();
    expect(attendanceRing(null)).toBeNull();
  });
});

describe("ledgerRows", () => {
  it("merges attendance and points by class number", () => {
    const rows = ledgerRows(batch());
    expect(rows.map((r) => [r.number, r.state, r.score, r.max])).toEqual([
      [1, "present", 60, 100],
      [2, "present", 60, 100],
      [3, "upcoming", null, null],
      [4, "upcoming", null, null],
    ]);
    expect(rows[0].rank).toBe(4);
    expect(rows[1].how).toBe("admin");
  });
  it("recorded student: points only, no attendance state", () => {
    const rows = ledgerRows(batch({ mode: "recorded", attendance: null }));
    expect(rows.map((r) => [r.number, r.state, r.score])).toEqual([
      [1, null, 60],
      [2, null, 60],
    ]);
  });
  it("the next class is the earliest upcoming one", () => {
    expect(nextClassNumber(ledgerRows(batch()))).toBe(3);
    expect(nextClassNumber(ledgerRows(batch({ mode: "recorded", attendance: null })))).toBeNull();
  });
});

describe("scoreMax", () => {
  it("only the board's real max: a missed quiz must not shrink it", () => {
    expect(scoreMax(batch(), { rank: 1, of: 2, gap: null, max: 300 })).toBe(300);
    expect(scoreMax(batch(), null)).toBeNull();
    expect(scoreMax(batch(), { rank: 1, of: 2, gap: null, max: null })).toBeNull();
  });
  it("unknown when any of the student's classes has no max, or there are no scores", () => {
    const b = batch();
    const partial = batch({ results: { total: 120, rows: [b.results.rows[0], { ...b.results.rows[1], max: null }] } });
    expect(scoreMax(partial, null)).toBeNull();
    expect(scoreMax(batch({ results: { total: 0, rows: [] } }), null)).toBeNull();
  });
});

describe("shareProgressHref", () => {
  it("is a WhatsApp link with the public batch page and no private data", () => {
    const href = shareProgressHref("Sample Batch", "https://example.test", "sample-batch");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(text).toContain("Sample Batch");
    expect(text).toContain("https://example.test/progress/sample-batch");
    expect(text).not.toMatch(/@/);
  });
});
