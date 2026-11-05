import { describe, it, expect } from "vitest";
import {
  gapAbove,
  initials,
  podium,
  podiumImageUrl,
  parsePodiumSize,
  PODIUM_SIZES,
  resolvePodiumPick,
  restRows,
  rowsFor,
  shortName,
} from "@/lib/progress/leaderboard";
import type { PortalBatchView, PortalResultRow } from "@/lib/progress/portal-build";

const live = (name: string, score: number, rank: number): PortalResultRow => ({ name, pzId: `${name}-0000`, mode: "live", score, rank });
const rec = (name: string, score: number): PortalResultRow => ({ name, pzId: `${name}-0000`, mode: "recorded", score, rank: null });

// Twelve live students with distinct scores, then two recorded ones (already in builder order).
const many: PortalResultRow[] = [
  ...Array.from({ length: 12 }, (_, i) => live(`Person${String.fromCharCode(65 + i)}`, 120 - i * 10, i + 1)),
  rec("Taped", 500),
  rec("Video", 5),
];

describe("podium", () => {
  it("takes the top three live-ranked rows", () => {
    expect(podium(many).map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(podium(many).map((r) => r.name)).toEqual(["PersonA", "PersonB", "PersonC"]);
  });

  it("never puts a recorded student on the podium, even with a higher score", () => {
    const rows = [live("Aaa", 10, 1), rec("Bbb", 999)];
    expect(podium(rows).map((r) => r.name)).toEqual(["Aaa"]);
  });

  it("keeps tied ranks as they are", () => {
    const rows = [live("Aaa", 90, 1), live("Bbb", 90, 1), live("Ccc", 50, 3), live("Ddd", 40, 4)];
    expect(podium(rows).map((r) => [r.name, r.rank])).toEqual([
      ["Aaa", 1],
      ["Bbb", 1],
      ["Ccc", 3],
    ]);
  });

  it("handles fewer than three and none", () => {
    expect(podium([live("Aaa", 5, 1)])).toHaveLength(1);
    expect(podium([])).toEqual([]);
    expect(podium([rec("Bbb", 5)])).toEqual([]);
  });
});

describe("restRows", () => {
  it("lists ranks 4 to 10 first, then everyone else with recorded students last", () => {
    const { top, more } = restRows(many);
    expect(top.map((r) => r.rank)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(more.map((r) => r.name)).toEqual(["PersonK", "PersonL", "Taped", "Video"]);
    expect(more.slice(2).every((r) => r.rank === null)).toBe(true);
  });

  it("with only recorded students everything is in 'more' and nothing is ranked", () => {
    const { top, more } = restRows([rec("Aaa", 3), rec("Bbb", 2)]);
    expect(top).toEqual([]);
    expect(more.map((r) => r.name)).toEqual(["Aaa", "Bbb"]);
  });

  it("a tie that pushes a fourth student onto rank 1 still lists them", () => {
    const rows = [live("A", 9, 1), live("B", 9, 1), live("C", 9, 1), live("D", 9, 1)];
    expect(restRows(rows).top.map((r) => r.name)).toEqual(["D"]);
  });
});

describe("gapAbove", () => {
  it("is the point gap to the student directly above", () => {
    expect(gapAbove(many, "PersonD-0000")).toEqual({ points: 10, rank: 3, name: "PersonC" });
  });

  it("is null for rank 1, for recorded students and for unknown ids", () => {
    expect(gapAbove(many, "PersonA-0000")).toBeNull();
    expect(gapAbove(many, "Taped-0000")).toBeNull();
    expect(gapAbove(many, "Nobody-0000")).toBeNull();
  });

  it("with ties, the one above is the nearest higher score, not the tied student", () => {
    const rows = [live("A", 100, 1), live("B", 80, 2), live("C", 80, 2), live("D", 75, 4)];
    expect(gapAbove(rows, "C-0000")).toEqual({ points: 20, rank: 1, name: "A" });
    expect(gapAbove(rows, "D-0000")).toEqual({ points: 5, rank: 2, name: "B" });
  });

  it("a tie at rank 1 has no gap", () => {
    expect(gapAbove([live("A", 9, 1), live("B", 9, 1)], "B-0000")).toBeNull();
  });
});

describe("initials and shortName", () => {
  it("uses first and last name letters and skips titles and punctuation", () => {
    expect(initials("Dr. Sample Person")).toBe("SP");
    expect(initials("(Dr.) Sample Name")).toBe("SN");
    expect(initials("faro")).toBe("F");
    expect(initials("Sample Middle Last")).toBe("SL");
    expect(initials("...")).toBe("?");
  });

  it("shortens long names at a word boundary", () => {
    expect(shortName("Short", 10)).toBe("Short");
    expect(shortName("Alpha Beta Gamma Delta", 12)).toBe("Alpha Beta…");
    expect(shortName("Abcdefghijklmnop", 6)).toBe("Abcde…");
  });
});

const view = {
  title: "Sample Batch",
  slug: "sample-batch",
  kind: "course",
  minPct: 75,
  state: "live",
  coverUrl: null,
  students: 2,
  classesHeld: 2,
  sessions: [
    { id: "s1", number: 1, title: "One", quizMax: null },
    { id: "s2", number: 2, title: "Two", quizMax: null },
  ],
  attendance: [],
  overall: [live("A", 9, 1)],
  perClass: { s1: [live("B", 5, 1)], s2: [] },
} satisfies PortalBatchView;

describe("rowsFor and resolvePodiumPick", () => {
  it("returns overall or one class", () => {
    expect(rowsFor(view, "overall")[0].name).toBe("A");
    expect(rowsFor(view, "s1")[0].name).toBe("B");
    expect(rowsFor(view, "zzz")).toEqual([]);
  });

  it("reads the class by id or by number; blank means Overall", () => {
    expect(resolvePodiumPick(view, null)).toEqual({ id: "overall", label: "Overall" });
    expect(resolvePodiumPick(view, "")).toEqual({ id: "overall", label: "Overall" });
    expect(resolvePodiumPick(view, "overall")).toEqual({ id: "overall", label: "Overall" });
    expect(resolvePodiumPick(view, "s2")).toEqual({ id: "s2", label: "Class 2" });
    expect(resolvePodiumPick(view, "1")).toEqual({ id: "s1", label: "Class 1" });
    expect(resolvePodiumPick(view, "9")).toBeNull();
    expect(resolvePodiumPick(view, "nope")).toBeNull();
  });
});

describe("image size and url", () => {
  it("parses the size, square by default", () => {
    expect(parsePodiumSize(null)).toBe("square");
    expect(parsePodiumSize("")).toBe("square");
    expect(parsePodiumSize("story")).toBe("story");
    expect(parsePodiumSize("huge")).toBeNull();
    expect(PODIUM_SIZES.square).toEqual({ width: 1080, height: 1080 });
    expect(PODIUM_SIZES.story).toEqual({ width: 1080, height: 1920 });
  });

  it("builds the image url, leaving out the class for Overall", () => {
    expect(podiumImageUrl("sample-batch", "square", "overall")).toBe("/api/progress-podium/sample-batch?size=square");
    expect(podiumImageUrl("a b", "story", "s1")).toBe("/api/progress-podium/a%20b?size=story&class=s1");
  });
});
