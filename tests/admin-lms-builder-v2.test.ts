// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));

const admin = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => admin.client }));
const trash = vi.hoisted(() => vi.fn(async (_ids: string[]) => null as string | null));
vi.mock("@/lib/data/drive-cleanup", () => ({ trashDriveFiles: trash }));

import {
  updateLesson,
  appendQuizQuestions,
  updateModuleNotes,
  getModuleNotes,
  getBuilderState,
  deleteModule,
} from "@/lib/data/admin-lms";

let store: Store;
function seed(extra: Store = {}) {
  store = {
    courses: [
      { id: "c-course", type: "course", slug: "c", title: "C", is_published: false },
      { id: "c-ws", type: "workshop", slug: "w", title: "W", is_published: false },
    ],
    modules: [
      { id: "m-1", course_id: "c-course", title: "M1", order_index: 0 },
      { id: "m-ws", course_id: "c-ws", title: "Sessions", order_index: 0 },
    ],
    lessons: [{ id: "l-1", module_id: "m-1", title: "L", content_type: "text", order_index: 0, video_url: null, video_url_2: null, pdf_file_id: null, documents: [] }],
    quiz_questions: [],
    module_notes: [],
    ...extra,
  };
  admin.state.handler = memoryHandler(store);
}

beforeEach(() => {
  admin.reset();
  trash.mockClear();
  seed();
});

describe("updateLesson derives content_type", () => {
  it("video then cleared gives video then text", async () => {
    await updateLesson("l-1", { videoUrl: "https://youtu.be/abc" });
    expect(store.lessons[0].content_type).toBe("video");
    await updateLesson("l-1", { videoUrl: "" });
    expect(store.lessons[0].content_type).toBe("text");
  });
  it("only a second video still gives video", async () => {
    await updateLesson("l-1", { videoUrl2: "https://youtu.be/xyz" });
    expect(store.lessons[0].video_url_2).toBe("https://youtu.be/xyz");
    expect(store.lessons[0].content_type).toBe("video");
  });
  it("pdf with no video gives pdf", async () => {
    await updateLesson("l-1", { pdfFileId: "file-1" });
    expect(store.lessons[0].content_type).toBe("pdf");
  });
  it("ignores a client-sent contentType for the stored value", async () => {
    await updateLesson("l-1", { contentType: "video" });
    expect(store.lessons[0].content_type).toBe("text");
  });
  it("leaves content_type alone when the patch touches no source field", async () => {
    store.lessons[0].content_type = "video";
    await updateLesson("l-1", { title: "New" });
    expect(store.lessons[0].content_type).toBe("video");
  });
});

describe("appendQuizQuestions", () => {
  const q = (n: number) => ({ question: `Q${n}`, options: ["a", "b"], correctIndex: 0 });
  it("inserts in one call continuing after the current max and never deletes", async () => {
    store.quiz_questions.push({ id: "x", lesson_id: "l-1", order_index: 4 });
    const res = await appendQuizQuestions("l-1", [q(1), q(2), q(3)]);
    expect(res).toMatchObject({ ok: true, created: 3 });
    const inserts = admin.find("quiz_questions", "insert");
    expect(inserts).toHaveLength(1);
    expect((inserts[0].payload as { order_index: number }[]).map((r) => r.order_index)).toEqual([5, 6, 7]);
    expect(admin.find("quiz_questions", "delete")).toHaveLength(0);
  });
  it("starts at 0 for an empty quiz", async () => {
    await appendQuizQuestions("l-1", [q(1)]);
    expect((admin.find("quiz_questions", "insert")[0].payload as { order_index: number }[])[0].order_index).toBe(0);
  });
  it("rejects more than 200 items without inserting", async () => {
    const res = await appendQuizQuestions("l-1", Array.from({ length: 201 }, (_, i) => q(i)));
    expect(res).toMatchObject({ ok: false, reason: "too-many" });
    expect(admin.find("quiz_questions", "insert")).toHaveLength(0);
  });
  it("returns not-found for an unknown lesson", async () => {
    expect(await appendQuizQuestions("nope", [q(1)])).toMatchObject({ ok: false, reason: "not-found" });
  });
});

describe("module notes", () => {
  it("rejects flat-type courses", async () => {
    expect(await updateModuleNotes("m-ws", { resources: [] })).toMatchObject({ ok: false, reason: "flat-type" });
  });
  it("returns not-found for an unknown module", async () => {
    expect(await updateModuleNotes("nope", { resources: [] })).toMatchObject({ ok: false, reason: "not-found" });
  });
  it("upserts on module_id with updated_at and trashes removed documents", async () => {
    store.module_notes.push({ module_id: "m-1", resource_urls: [], documents: [{ name: "a", fileId: "f1" }, { name: "b", fileId: "f2" }], updated_at: null });
    const res = await updateModuleNotes("m-1", { documents: [{ name: "b", fileId: "f2" }] });
    expect(res.ok).toBe(true);
    const up = admin.find("module_notes", "upsert")[0];
    expect(up.upsertOptions).toMatchObject({ onConflict: "module_id" });
    const payload = up.payload as Record<string, unknown>;
    expect(payload.module_id).toBe("m-1");
    expect(typeof payload.updated_at).toBe("string");
    expect(trash).toHaveBeenCalledWith(["f1"]);
  });
  it("getModuleNotes returns empty defaults when no row", async () => {
    expect(await getModuleNotes("m-1")).toEqual({ resources: [], documents: [] });
  });
});

describe("getBuilderState", () => {
  it("marks hasVideo from video_url_2 alone, counts quizzes and notes", async () => {
    store.lessons.push(
      { id: "l-2", module_id: "m-1", title: "L2", content_type: "text", order_index: 1, video_url: "  ", video_url_2: "https://youtu.be/x" },
    );
    store.quiz_questions.push({ id: "q1", lesson_id: "l-2", order_index: 0 }, { id: "q2", lesson_id: "l-2", order_index: 1 });
    store.module_notes.push({ module_id: "m-1", resource_urls: [{ label: "a", url: "u" }], documents: [{ name: "d", fileId: "f" }] });
    const state = await getBuilderState("c-course");
    const lessons = state!.modules[0].lessons;
    expect(lessons.find((l) => l.id === "l-1")).toMatchObject({ hasVideo: false, quizCount: 0 });
    expect(lessons.find((l) => l.id === "l-2")).toMatchObject({ hasVideo: true, quizCount: 2 });
    expect(state!.modules[0].notesCount).toBe(2);
  });
});

describe("deleteModule", () => {
  it("also trashes module notes documents", async () => {
    store.module_notes.push({ module_id: "m-1", resource_urls: [], documents: [{ name: "d", fileId: "note-f" }] });
    const res = await deleteModule("m-1");
    expect(res.ok).toBe(true);
    expect(trash.mock.calls[0][0]).toContain("note-f");
  });
});
