// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Res, type Store } from "./helpers/supabase-mock";
import type { ImportPlan } from "@/lib/lms/course-import/analyze";

vi.mock("server-only", () => ({}));

const admin = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => admin.client }));

import { createCourseFromPlan } from "@/lib/data/course-import";

let store: Store;

beforeEach(() => {
  admin.reset();
  store = { courses: [], modules: [], lessons: [], quiz_questions: [], module_notes: [] };
  admin.state.handler = memoryHandler(store);
});

const q = (n: number) => ({ question: `Q${n}`, options: ["a", "b", "c"], correctIndex: n % 3 });

function coursePlan(): ImportPlan {
  return {
    title: "Pharma Basics",
    type: "course",
    modules: [
      {
        title: "Module One",
        notes: [{ label: "Slides", url: "https://x.com/s" }],
        sessions: [
          {
            title: "S1",
            videoUrl: "https://youtu.be/aaa",
            videoUrl2: "https://youtu.be/bbb",
            notes: [{ label: "N1", url: "https://x.com/n1" }],
            questions: [q(0), q(1)],
          },
          { title: "S2", videoUrl: "", videoUrl2: "", notes: [], questions: [q(2)] },
        ],
      },
      {
        title: "Module Two",
        notes: [],
        sessions: [
          { title: "S3", videoUrl: "https://youtu.be/ccc", videoUrl2: "", notes: [], questions: [] },
          { title: "S4", videoUrl: "https://youtu.be/ddd", videoUrl2: "", notes: [], questions: [q(3)] },
        ],
      },
    ],
  };
}

describe("createCourseFromPlan", () => {
  it("creates modules, lessons, notes and quiz questions in order", async () => {
    const res = await createCourseFromPlan(coursePlan());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const c = store.courses.find((x) => x.id === res.id)!;
    expect(c).toMatchObject({ title: "Pharma Basics", type: "course", status: "draft", is_published: false });

    const mods = store.modules.filter((m) => m.course_id === res.id);
    expect(mods.map((m) => [m.title, m.order_index])).toEqual([
      ["Module One", 0],
      ["Module Two", 1],
    ]);

    const lessonsOf = (title: string) => store.lessons.filter((l) => l.module_id === mods.find((m) => m.title === title)!.id);
    const m1 = lessonsOf("Module One");
    expect(m1.map((l) => [l.title, l.order_index])).toEqual([
      ["S1", 0],
      ["S2", 1],
    ]);
    expect(m1[0]).toMatchObject({
      content_type: "video",
      video_url: "https://youtu.be/aaa",
      video_url_2: "https://youtu.be/bbb",
      resource_urls: [{ label: "N1", url: "https://x.com/n1" }],
    });
    expect(m1[1]).toMatchObject({ content_type: "text", video_url: null, video_url_2: null, resource_urls: [] });
    expect(lessonsOf("Module Two").map((l) => [l.title, l.order_index])).toEqual([
      ["S3", 0],
      ["S4", 1],
    ]);

    const s1 = m1[0].id;
    const qs = store.quiz_questions.filter((x) => x.lesson_id === s1);
    expect(qs.map((x) => [x.question, x.options, x.correct_index, x.order_index])).toEqual([
      ["Q0", ["a", "b", "c"], 0, 0],
      ["Q1", ["a", "b", "c"], 1, 1],
    ]);
    expect(store.quiz_questions).toHaveLength(4);

    expect(store.module_notes).toHaveLength(1);
    expect(store.module_notes[0]).toMatchObject({
      module_id: mods[0].id,
      resource_urls: [{ label: "Slides", url: "https://x.com/s" }],
    });
    expect(typeof store.module_notes[0].updated_at).toBe("string");
  });

  it("workshop plan puts sessions in the hidden module", async () => {
    const plan: ImportPlan = {
      title: "Live Workshop",
      type: "workshop",
      modules: [
        {
          title: "",
          notes: [],
          sessions: [
            { title: "A", videoUrl: "https://youtu.be/a", videoUrl2: "", notes: [], questions: [q(0)] },
            { title: "B", videoUrl: "https://youtu.be/b", videoUrl2: "", notes: [], questions: [] },
          ],
        },
      ],
    };
    const res = await createCourseFromPlan(plan);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const mods = store.modules.filter((m) => m.course_id === res.id);
    expect(mods).toHaveLength(1);
    expect(mods[0].title).toBe("Sessions");
    expect(store.lessons.filter((l) => l.module_id === mods[0].id).map((l) => [l.title, l.order_index])).toEqual([
      ["A", 0],
      ["B", 1],
    ]);
    expect(store.module_notes).toHaveLength(0);
    expect(admin.find("module_notes", "insert")).toHaveLength(0);
  });

  it("a failing lesson insert leaves no course behind", async () => {
    const mem = memoryHandler(store);
    admin.state.handler = (op: Op): Res =>
      op.table === "lessons" && op.op === "insert" ? { data: null, error: { message: "boom" } } : mem(op);
    const res = await createCourseFromPlan(coursePlan());
    expect(res).toEqual({ ok: false, reason: "db-error" });
    expect(store.courses).toHaveLength(0);
  });

  it("a failing quiz insert leaves no course behind", async () => {
    const mem = memoryHandler(store);
    admin.state.handler = (op: Op): Res =>
      op.table === "quiz_questions" && op.op === "insert" ? { data: null, error: { message: "boom" } } : mem(op);
    const res = await createCourseFromPlan(coursePlan());
    expect(res).toEqual({ ok: false, reason: "db-error" });
    expect(store.courses).toHaveLength(0);
  });

  it("quiz rows are inserted in chunks of 500", async () => {
    const plan: ImportPlan = {
      title: "Big",
      type: "workshop",
      modules: [
        {
          title: "",
          notes: [],
          sessions: Array.from({ length: 3 }, (_, s) => ({
            title: `S${s}`,
            videoUrl: "https://youtu.be/a",
            videoUrl2: "",
            notes: [],
            questions: Array.from({ length: 400 }, (_, i) => q(i)),
          })),
        },
      ],
    };
    const res = await createCourseFromPlan(plan);
    expect(res.ok).toBe(true);
    const inserts = admin.find("quiz_questions", "insert");
    expect(inserts.map((o) => (o.payload as unknown[]).length)).toEqual([500, 500, 200]);
    expect(store.quiz_questions).toHaveLength(1200);
  });
});
