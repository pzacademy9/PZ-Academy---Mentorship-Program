// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; arg?: unknown; in?: unknown };
const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; arg?: unknown; in?: unknown }[],
  fail: {} as Record<string, boolean>,
  emCount: 0,
  deleteLesson: vi.fn(),
  deleteModule: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from(table: string) {
      let op = "select";
      let arg: unknown;
      let inArg: unknown;
      const result = () => {
        h.calls.push({ table, op, arg, in: inArg });
        if (h.fail[`${table}.${op}`]) return { data: null, error: { message: "boom" } };
        if (table === "enrollment_modules") return { data: null, error: null, count: h.emCount };
        if (table === "quiz_questions" && op === "select") {
          return { data: [{ id: "q1", order_index: 0 }, { id: "q2", order_index: 1 }], error: null };
        }
        if (table === "lessons" && op === "select") return { data: { video_url: null, video_url_2: null }, error: null };
        return { data: null, error: null };
      };
      const b: Record<string, unknown> = {
        select: () => b,
        insert: (a: unknown) => { op = "insert"; arg = a; return b; },
        update: (a: unknown) => { op = "update"; arg = a; return b; },
        delete: () => { op = "delete"; return b; },
        eq: () => b,
        in: (_c: string, v: unknown) => { inArg = v; return b; },
        maybeSingle: async () => result(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/data/admin-lms", () => ({
  ensureDefaultModule: vi.fn(),
  deleteLesson: h.deleteLesson,
  deleteModule: h.deleteModule,
}));

import { applyCurriculumChanges } from "@/lib/data/course-curriculum-import";

const plan = {
  title: "T",
  type: "course",
  details: {},
  modules: [{
    title: "Basics",
    notes: [],
    sessions: [{
      title: "Intro", videoUrl: "", videoUrl2: "", notes: [],
      questions: [{ question: "Q new?", options: ["A", "B"], correctIndex: 0 }],
    }],
  }],
} as never;

const change = {
  id: "update-session:l1", label: "x", defaultOn: true, kind: "update-session",
  lessonId: "l1", moduleIndex: 0, sessionIndex: 0, rows: [{ part: "quiz", from: "2 questions", to: "1 question" }],
} as never;

const quizCalls = (op: string) => h.calls.filter((c) => c.table === "quiz_questions" && c.op === op);

beforeEach(() => {
  h.calls.length = 0;
  h.fail = {};
  h.emCount = 0;
  h.deleteLesson.mockReset();
  h.deleteModule.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const removeSession = (lessonId: string, title: string) =>
  ({ id: `remove-session:${lessonId}`, label: "x", defaultOn: false, kind: "remove-session", lessonId, title }) as never;
const removeModule = (moduleId: string, title: string) =>
  ({ id: `remove-module:${moduleId}`, label: "x", defaultOn: false, kind: "remove-module", moduleId, title }) as never;
const rawDeletes = () => h.calls.filter((c) => (c.table === "lessons" || c.table === "modules") && c.op === "delete");

describe("applyCurriculumChanges removals", () => {
  it("keeps a blocked session, reports it, and still removes the other ticked session", async () => {
    h.deleteLesson.mockImplementation(async (id: string) =>
      id === "l2"
        ? { ok: false, reason: "blocked-published-active", recordCount: 3 }
        : { ok: true, id, warning: null },
    );
    const res = await applyCurriculumChanges("c1", plan, [removeSession("l2", "Old One"), removeSession("l3", "Old Two")]);
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(1);
    expect(res.notes).toEqual([
      "Old One was kept. It has student progress on a live program. Remove it in the builder if you are sure.",
    ]);
    expect(h.deleteLesson).toHaveBeenCalledWith("l2", true);
    expect(h.deleteLesson).toHaveBeenCalledWith("l3", true);
    expect(rawDeletes()).toHaveLength(0);
  });

  it("removes an allowed module through the builder's delete and passes on its Drive warning", async () => {
    h.deleteModule.mockResolvedValue({ ok: true, id: "m2", warning: "1 of 1 old file couldn't be removed from Drive." });
    const res = await applyCurriculumChanges("c1", plan, [removeModule("m2", "Extra")]);
    expect(res).toEqual({ ok: true, applied: 1, notes: ["1 of 1 old file couldn't be removed from Drive."] });
    expect(h.deleteModule).toHaveBeenCalledWith("m2", true);
    expect(rawDeletes()).toHaveLength(0);
  });

  it("keeps a module some students were given on its own", async () => {
    h.emCount = 2;
    const res = await applyCurriculumChanges("c1", plan, [removeModule("m2", "Extra")]);
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(0);
    expect(res.notes[0]).toMatch(/^Extra was kept\./);
    expect(h.deleteModule).not.toHaveBeenCalled();
    expect(rawDeletes()).toHaveLength(0);
  });

  it("keeps a blocked module and deletes nothing", async () => {
    h.deleteModule.mockResolvedValue({ ok: false, reason: "blocked-published-active", recordCount: 5 });
    const res = await applyCurriculumChanges("c1", plan, [removeModule("m2", "Extra")]);
    expect(res).toEqual({
      ok: true,
      applied: 0,
      notes: ["Extra was kept. It has student progress on a live program. Remove it in the builder if you are sure."],
    });
    expect(rawDeletes()).toHaveLength(0);
  });

  it("stops when the enrollment check fails, and deletes nothing", async () => {
    h.fail["enrollment_modules.select"] = true;
    const res = await applyCurriculumChanges("c1", plan, [removeModule("m2", "Extra")]);
    expect(res.ok).toBe(false);
    expect(h.deleteModule).not.toHaveBeenCalled();
  });

  it("stops on a database error from the builder's delete", async () => {
    h.deleteLesson.mockResolvedValue({ ok: false, reason: "db-error" });
    const res = await applyCurriculumChanges("c1", plan, [removeSession("l2", "Old One"), removeSession("l3", "Old Two")]);
    expect(res.ok).toBe(false);
    expect(h.deleteLesson).toHaveBeenCalledTimes(1);
  });
});

describe("applyCurriculumChanges quiz replace", () => {
  it("inserts the new questions after the old ones, then deletes only the old ids", async () => {
    const res = await applyCurriculumChanges("c1", plan, [change]);
    expect(res).toEqual({ ok: true, applied: 1, notes: [] });
    const ins = quizCalls("insert");
    expect((ins[0].arg as { order_index: number }[])[0].order_index).toBe(2);
    expect(quizCalls("delete")[0].in).toEqual(["q1", "q2"]);
    expect(h.calls.findIndex((c) => c.op === "insert")).toBeLessThan(h.calls.findIndex((c) => c.op === "delete"));
  });

  it("deletes nothing when the insert fails", async () => {
    h.fail["quiz_questions.insert"] = true;
    const res = await applyCurriculumChanges("c1", plan, [change]);
    expect(res.ok).toBe(false);
    expect(quizCalls("delete")).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("says plainly where the quiz stands when the old rows cannot be removed", async () => {
    h.fail["quiz_questions.delete"] = true;
    const res = await applyCurriculumChanges("c1", plan, [change]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/new quiz was saved/);
  });
});
