import { describe, expect, it } from "vitest";
import type { ImportModule, ImportPlan, ImportSession } from "@/lib/lms/course-import/analyze";
import {
  compareCurriculum,
  normalizeName,
  type CurrentCurriculum,
  type CurrentLesson,
  type CurrentModule,
} from "@/lib/lms/course-import/compare";

const q = (opt = "B") => [{ question: "Q1?", options: ["A", opt], correctIndex: 0 }];
const links = [{ label: "Slides", url: "https://x.test/a" }];

function lesson(id: string, title: string, over: Partial<CurrentLesson> = {}): CurrentLesson {
  return { id, title, videoUrl: "https://v.test/1", videoUrl2: "", notes: links, questions: q(), ...over };
}
function mod(id: string, title: string, lessons: CurrentLesson[], notes = links): CurrentModule {
  return { id, title, notes, lessons };
}
function session(title: string, over: Partial<ImportSession> = {}): ImportSession {
  return { title, videoUrl: "https://v.test/1", videoUrl2: "", notes: links, questions: q(), ...over };
}
function fmod(title: string, sessions: ImportSession[], notes = links): ImportModule {
  return { title, notes, sessions };
}
function plan(modules: ImportModule[]): ImportPlan {
  return { title: "T", type: "course", details: {}, modules } as unknown as ImportPlan;
}
const cur = (modules: CurrentModule[], flat = false): CurrentCurriculum => ({ flat, modules });

describe("normalizeName", () => {
  it("lowercases, collapses spaces and maps dashes", () => {
    expect(normalizeName("  Day 1 – Intro ")).toBe("day 1 - intro");
    expect(normalizeName("A—B")).toBe("a-b");
  });
});

describe("compareCurriculum", () => {
  const base = () => cur([mod("m1", "Module 1", [lesson("l1", "Day 1"), lesson("l2", "Day 2")])]);
  const basePlan = () => plan([fmod("Module 1", [session("Day 1"), session("Day 2")])]);

  it("returns nothing when identical", () => {
    expect(compareCurriculum(base(), basePlan())).toEqual([]);
  });

  it("adds a new module as one row", () => {
    const p = basePlan();
    p.modules.push(fmod("Module 2", [session("A"), session("B"), session("C")]));
    const out = compareCurriculum(base(), p);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "new-module:1", kind: "new-module", moduleIndex: 1, sessionCount: 3, defaultOn: true });
  });

  it("adds a missing session to a matched module", () => {
    const p = basePlan();
    p.modules[0].sessions.push(session("Day 3"));
    const out = compareCurriculum(base(), p);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "new-session:0:2", kind: "new-session", moduleId: "m1", defaultOn: true });
  });

  it("updates the video when it differs", () => {
    const p = basePlan();
    p.modules[0].sessions[0].videoUrl = "https://v.test/2";
    const out = compareCurriculum(base(), p);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "update-session:l1", kind: "update-session", lessonId: "l1" });
    expect((out[0] as { rows: unknown }).rows).toEqual([
      { part: "video", from: "https://v.test/1", to: "https://v.test/2" },
    ]);
  });

  it("leaves existing parts alone when the file part is empty", () => {
    const p = basePlan();
    p.modules[0].sessions[0] = session("Day 1", { videoUrl: "", notes: [], questions: [] });
    expect(compareCurriculum(base(), p)).toEqual([]);
  });

  it("flags a changed quiz", () => {
    const p = basePlan();
    p.modules[0].sessions[1].questions = q("C");
    const out = compareCurriculum(base(), p);
    expect(out).toHaveLength(1);
    const rows = (out[0] as { rows: { part: string }[] }).rows;
    expect(rows.map((r) => r.part)).toEqual(["quiz"]);
  });

  it("matches names ignoring dashes and spacing", () => {
    const c = cur([mod("m1", "Module 1", [lesson("l1", "day 1 - intro")])]);
    const p = plan([fmod("Module 1", [session("Day 1 –  Intro")])]);
    expect(compareCurriculum(c, p)).toEqual([]);
  });

  it("treats a repeated name as a new session with a note", () => {
    const c = cur([mod("m1", "Module 1", [lesson("l1", "Day 1")])]);
    const p = plan([fmod("Module 1", [session("Day 1"), session("day 1")])]);
    const out = compareCurriculum(c, p);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "new-session:0:1", kind: "new-session" });
    expect((out[0] as { note?: string }).note).toMatch(/repeated/i);
  });

  it("offers removal of items not in the file, off by default", () => {
    const c = cur([
      mod("m1", "Module 1", [lesson("l1", "Day 1"), lesson("l2", "Day 2")]),
      mod("m2", "Old", [lesson("l3", "Gone")]),
    ]);
    const p = plan([fmod("Module 1", [session("Day 1")])]);
    const out = compareCurriculum(c, p);
    expect(out.map((r) => r.id).sort()).toEqual(["remove-module:m2", "remove-session:l2"]);
    expect(out.every((r) => r.defaultOn === false)).toBe(true);
  });

  it("updates module notes only when the file has notes and they differ", () => {
    const p = basePlan();
    p.modules[0].notes = [...links, { label: "More", url: "https://x.test/b" }];
    const out = compareCurriculum(base(), p);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "update-module-notes:m1", kind: "update-module-notes", moduleId: "m1" });
    const p2 = basePlan();
    p2.modules[0].notes = [];
    expect(compareCurriculum(base(), p2)).toEqual([]);
  });

  it("flat programs match sessions across modules and make no module rows", () => {
    const c = cur(
      [mod("h1", "Hidden", [lesson("l1", "Day 1"), lesson("l2", "Old one")])],
      true,
    );
    const p = plan([fmod("Whatever", [session("Day 1"), session("Day 9")], [])]);
    const out = compareCurriculum(c, p);
    expect(out.map((r) => r.id).sort()).toEqual(["new-session:0:1", "remove-session:l2"]);
    expect(out.find((r) => r.kind === "new-session")).toMatchObject({ moduleId: null });
    expect(out.some((r) => r.kind === "new-module" || r.kind === "remove-module" || r.kind === "update-module-notes")).toBe(false);
  });
});
