// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Op, type Res, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));

const admin = createSupabaseMock();
const server = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => admin.client }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => server.client }));
vi.mock("@/lib/data/drive-cleanup", () => ({ trashDriveFiles: vi.fn(async () => null) }));

import { copyModule, copyCourse } from "@/lib/data/admin-lms";

let store: Store;

function seed(type = "course"): void {
  store = {
    courses: [
      {
        id: "c-1", slug: "demo", title: "Demo", type, status: "published", is_published: true,
        tagline: "t", description: "d", price_pkr: 5000, level: "Beginner", duration_text: "4 Weeks",
        duration_weeks: 4, timings: "9pm", features: ["a"], outcomes: ["b"], faqs: [], register_url: "u",
        mentor_name: "M", mentor_title: "T", mentor_bio: "B",
        thumbnail_url: "thumb", banner_url: "ban", mentor_avatar_url: "av", sheet_id: "sheet",
        gas_webapp_url: "gas", portal_url: "portal", public_video_url: "pv",
      },
    ],
    modules: [{ id: "m-1", course_id: "c-1", title: "Intro", order_index: 0 }],
    lessons: [
      { id: "l-1", module_id: "m-1", title: "A", content_type: "video", video_url: "v1", video_url_2: "v2", text_content: "<p>x</p>", resource_urls: [{ label: "L", url: "u" }], pdf_file_id: "pdf1", documents: [{ fileId: "d1", name: "n" }], order_index: 0 },
      { id: "l-2", module_id: "m-1", title: "B", content_type: "text", video_url: null, video_url_2: null, text_content: "t", resource_urls: [], pdf_file_id: null, documents: [], order_index: 1 },
    ],
    quiz_questions: [
      { id: "q-1", lesson_id: "l-1", question: "Q1", options: ["a", "b"], correct_index: 1, order_index: 0 },
      { id: "q-2", lesson_id: "l-1", question: "Q2", options: ["a", "b"], correct_index: 0, order_index: 1 },
    ],
    module_notes: [{ module_id: "m-1", resource_urls: [{ label: "N", url: "nu" }], documents: [{ fileId: "nd", name: "nn" }] }],
  };
  admin.state.handler = memoryHandler(store);
}

beforeEach(() => {
  admin.reset();
  server.reset();
});

describe("copyModule", () => {
  it("copies lessons and questions, skips Drive files and reports the count", async () => {
    seed();
    const res = await copyModule("m-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.filesToReupload).toBe(3); // 1 lesson pdf + 1 lesson doc + 1 notes doc
    const newMod = store.modules.find((m) => m.id === res.id)!;
    expect(newMod.title).toBe("Intro (copy)");
    expect(newMod.order_index).toBe(1);
    const newLessons = store.lessons.filter((l) => l.module_id === res.id);
    expect(newLessons).toHaveLength(2);
    expect(newLessons[0]).toMatchObject({ video_url: "v1", video_url_2: "v2" });
    expect(newLessons[0].pdf_file_id).toBeUndefined();
    expect(newLessons[0].documents).toBeUndefined();
    const ids = newLessons.map((l) => l.id);
    expect(store.quiz_questions.filter((q) => ids.includes(q.lesson_id as string))).toHaveLength(2);
    const notes = store.module_notes.find((n) => n.module_id === res.id)!;
    expect(notes.resource_urls).toEqual([{ label: "N", url: "nu" }]);
    expect(notes.documents).toEqual([]);
  });

  it("refuses a flat-type course", async () => {
    seed("workshop");
    expect(await copyModule("m-1")).toEqual({ ok: false, reason: "flat-type" });
  });

  it("returns not-found for an unknown module", async () => {
    seed();
    expect(await copyModule("nope")).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("copyCourse", () => {
  it("copies structure as a draft with a unique slug and no connections", async () => {
    seed();
    const res = await copyCourse("c-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.slug).toBe("demo-copy");
    expect(res.filesToReupload).toBe(3);
    const c = store.courses.find((x) => x.id === res.id)!;
    expect(c).toMatchObject({ title: "Demo (copy)", status: "draft", is_published: false, price_pkr: 5000, tagline: "t" });
    for (const k of ["thumbnail_url", "banner_url", "mentor_avatar_url", "sheet_id", "gas_webapp_url", "portal_url", "public_video_url"]) {
      expect(c[k]).toBeUndefined();
    }
    const mods = store.modules.filter((m) => m.course_id === res.id);
    expect(mods).toHaveLength(1);
    expect(store.lessons.filter((l) => l.module_id === mods[0].id)).toHaveLength(2);
  });

  it("picks -copy-2 when -copy exists", async () => {
    seed();
    store.courses.push({ id: "c-2", slug: "demo-copy", title: "x", type: "course" });
    const res = await copyCourse("c-1");
    expect(res.ok && res.slug).toBe("demo-copy-2");
  });

  it("succeeds for a course with zero modules", async () => {
    seed();
    store.modules.length = 0;
    store.lessons.length = 0;
    store.quiz_questions.length = 0;
    store.module_notes.length = 0;
    const res = await copyCourse("c-1");
    expect(res.ok && res.filesToReupload).toBe(0);
  });

  it("returns not-found for an unknown course", async () => {
    seed();
    expect(await copyCourse("nope")).toEqual({ ok: false, reason: "not-found" });
  });

  it("removes the new course when a lesson insert fails", async () => {
    seed();
    const mem = memoryHandler(store);
    admin.state.handler = (op: Op): Res =>
      op.table === "lessons" && op.op === "insert" ? { data: null, error: { message: "boom" } } : mem(op);
    const res = await copyCourse("c-1");
    expect(res).toEqual({ ok: false, reason: "db-error" });
    expect(admin.find("courses", "delete")).toHaveLength(1);
    expect(store.courses.filter((c) => c.id !== "c-1")).toHaveLength(0);
  });
});

describe("GET /api/modules/[id]/documents/[fileId]", () => {
  it("404s for a fileId not in the module list and never touches the admin client", async () => {
    server.state.handler = () => ({ data: { documents: [{ fileId: "f-1", name: "a.pdf" }] }, error: null });
    const { GET } = await import("@/app/api/modules/[id]/documents/[fileId]/route");
    const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id: "m-1", fileId: "other" }) });
    expect(res.status).toBe(404);
    expect(admin.state.ops).toHaveLength(0);
    expect(server.find("module_notes", "select")).toHaveLength(1);
  });

  it("404s when RLS hides the row", async () => {
    server.state.handler = () => ({ data: null, error: null });
    const { GET } = await import("@/app/api/modules/[id]/documents/[fileId]/route");
    const res = await GET(new Request("http://x") as never, { params: Promise.resolve({ id: "m-1", fileId: "f-1" }) });
    expect(res.status).toBe(404);
    expect(admin.state.ops).toHaveLength(0);
  });
});
