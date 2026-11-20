// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Call = { table: string; op: string; arg?: unknown; in?: unknown };
const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; arg?: unknown; in?: unknown }[],
  fail: {} as Record<string, boolean>,
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
vi.mock("@/lib/data/admin-lms", () => ({ ensureDefaultModule: vi.fn() }));

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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applyCurriculumChanges quiz replace", () => {
  it("inserts the new questions after the old ones, then deletes only the old ids", async () => {
    const res = await applyCurriculumChanges("c1", plan, [change]);
    expect(res).toEqual({ ok: true, applied: 1 });
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
