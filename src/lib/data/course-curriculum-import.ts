import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ensureDefaultModule, type LessonResourceLink, type QuizQuestionInput } from "@/lib/data/admin-lms";
import { usesFlatSessions, type CourseType, type LessonContentType } from "@/lib/validations/admin-lms";
import type { Json } from "@/lib/supabase/database.types";
import { deriveContentType } from "@/lib/lms/lesson-parts";
import type { ImportPlan, ImportSession } from "@/lib/lms/course-import/analyze";
import type { CurrentCurriculum, CurriculumChange } from "@/lib/lms/course-import/compare";

const QUIZ_CHUNK = 500;

function toJson(links: LessonResourceLink[]): Json {
  return links.map((l) => ({ label: l.label, url: l.url }));
}

function toLinks(v: unknown): LessonResourceLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is { label?: unknown; url?: unknown } => !!x && typeof x === "object")
    .map((x) => ({ label: String(x.label ?? ""), url: String(x.url ?? "") }));
}

/** Reads the program as it stands, in the shape compareCurriculum expects. Null when it does not exist. */
export async function loadCurrentCurriculum(
  courseId: string,
): Promise<{ type: CourseType; curriculum: CurrentCurriculum } | null> {
  const admin = createAdminSupabase();
  const { data: course, error: courseError } = await admin
    .from("courses")
    .select("id, type")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) throw new Error("course lookup failed");
  if (!course) return null;

  const { data: modules, error: modError } = await admin
    .from("modules")
    .select("id, title, order_index")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  if (modError) throw new Error("module lookup failed");

  const moduleIds = (modules ?? []).map((x) => x.id);
  const lessons = moduleIds.length === 0 ? [] : await (async () => {
    const { data, error } = await admin
      .from("lessons")
      .select("id, title, video_url, video_url_2, resource_urls, module_id, order_index")
      .in("module_id", moduleIds)
      .order("order_index", { ascending: true });
    if (error) throw new Error("lesson lookup failed");
    return data ?? [];
  })();

  const lessonIds = lessons.map((l) => l.id);
  const quizzes = lessonIds.length === 0 ? [] : await (async () => {
    const { data, error } = await admin
      .from("quiz_questions")
      .select("lesson_id, question, options, correct_index, order_index")
      .in("lesson_id", lessonIds)
      .order("order_index", { ascending: true });
    if (error) throw new Error("quiz lookup failed");
    return data ?? [];
  })();

  const notes = moduleIds.length === 0 ? [] : await (async () => {
    const { data, error } = await admin
      .from("module_notes")
      .select("module_id, resource_urls")
      .in("module_id", moduleIds);
    if (error) throw new Error("module notes lookup failed");
    return data ?? [];
  })();

  const questionsByLesson = new Map<string, QuizQuestionInput[]>();
  for (const q of quizzes) {
    const list = questionsByLesson.get(q.lesson_id) ?? [];
    list.push({ question: q.question, options: q.options as unknown as string[], correctIndex: q.correct_index });
    questionsByLesson.set(q.lesson_id, list);
  }
  const notesByModule = new Map(notes.map((n) => [n.module_id, toLinks(n.resource_urls)]));

  const type = course.type as CourseType;
  return {
    type,
    curriculum: {
      flat: usesFlatSessions(type),
      modules: (modules ?? []).map((mod) => ({
        id: mod.id,
        title: mod.title,
        notes: notesByModule.get(mod.id) ?? [],
        lessons: lessons
          .filter((l) => l.module_id === mod.id)
          .map((l) => ({
            id: l.id,
            title: l.title,
            videoUrl: l.video_url ?? "",
            videoUrl2: l.video_url_2 ?? "",
            notes: toLinks(l.resource_urls),
            questions: questionsByLesson.get(l.id) ?? [],
          })),
      })),
    },
  };
}

export type ApplyCurriculumResult =
  | { ok: true; applied: number }
  | { ok: false; applied: number; message: string };

const SAVE_FAILED = "Some changes could not be saved. The ones before it were applied.";

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Applies exactly the rows passed in, in order: new modules, new sessions,
 * updates, removes. The first failure stops and reports what was applied.
 * Nothing is deleted except by a remove row.
 */
export async function applyCurriculumChanges(
  courseId: string,
  plan: ImportPlan,
  changes: CurriculumChange[],
): Promise<ApplyCurriculumResult> {
  const admin = createAdminSupabase();
  let applied = 0;

  async function insertQuiz(lessonId: string, s: ImportSession): Promise<void> {
    const rows = s.questions.map((q, qi) => ({
      lesson_id: lessonId,
      question: q.question,
      options: q.options,
      correct_index: q.correctIndex,
      order_index: qi,
    }));
    for (let i = 0; i < rows.length; i += QUIZ_CHUNK) {
      const { error } = await admin.from("quiz_questions").insert(rows.slice(i, i + QUIZ_CHUNK));
      check(error);
    }
  }

  async function insertLesson(moduleId: string, s: ImportSession, orderIndex: number): Promise<void> {
    const lessonId = crypto.randomUUID();
    const videoUrl = s.videoUrl.trim() || null;
    const videoUrl2 = s.videoUrl2.trim() || null;
    const contentType: LessonContentType = deriveContentType({ videoUrl, videoUrl2 });
    const { error } = await admin.from("lessons").insert({
      id: lessonId,
      module_id: moduleId,
      title: s.title,
      content_type: contentType,
      order_index: orderIndex,
      video_url: videoUrl,
      video_url_2: videoUrl2,
      resource_urls: toJson(s.notes),
    });
    check(error);
    await insertQuiz(lessonId, s);
  }

  async function nextLessonOrder(moduleId: string): Promise<number> {
    const { data, error } = await admin
      .from("lessons")
      .select("order_index")
      .eq("module_id", moduleId)
      .order("order_index", { ascending: false })
      .limit(1);
    check(error);
    return data && data.length > 0 ? data[0].order_index + 1 : 0;
  }

  async function nextModuleOrder(): Promise<number> {
    const { data, error } = await admin
      .from("modules")
      .select("order_index")
      .eq("course_id", courseId)
      .order("order_index", { ascending: false })
      .limit(1);
    check(error);
    return data && data.length > 0 ? data[0].order_index + 1 : 0;
  }

  const ofKind = <K extends CurriculumChange["kind"]>(k: K) =>
    changes.filter((c): c is Extract<CurriculumChange, { kind: K }> => c.kind === k);

  try {
    for (const c of ofKind("new-module")) {
      const fm = plan.modules[c.moduleIndex];
      const moduleId = crypto.randomUUID();
      const { error } = await admin
        .from("modules")
        .insert({ id: moduleId, course_id: courseId, title: fm.title, order_index: await nextModuleOrder() });
      check(error);
      if (fm.notes.length > 0) {
        const { error: noteError } = await admin
          .from("module_notes")
          .insert({ module_id: moduleId, resource_urls: toJson(fm.notes), updated_at: new Date().toISOString() });
        check(noteError);
      }
      for (let si = 0; si < fm.sessions.length; si++) {
        await insertLesson(moduleId, fm.sessions[si], si);
      }
      applied++;
    }

    for (const c of ofKind("new-session")) {
      const s = plan.modules[c.moduleIndex].sessions[c.sessionIndex];
      const moduleId = c.moduleId ?? (await ensureDefaultModule(courseId));
      await insertLesson(moduleId, s, await nextLessonOrder(moduleId));
      applied++;
    }

    for (const c of ofKind("update-session")) {
      const s = plan.modules[c.moduleIndex].sessions[c.sessionIndex];
      const parts = new Set(c.rows.map((r) => r.part));
      const { data: lesson, error: readError } = await admin
        .from("lessons")
        .select("video_url, video_url_2")
        .eq("id", c.lessonId)
        .maybeSingle();
      check(readError);
      if (!lesson) throw new Error("lesson not found");

      const patch: {
        video_url?: string | null;
        video_url_2?: string | null;
        resource_urls?: Json;
        content_type?: LessonContentType;
      } = {};
      let video = lesson.video_url;
      let video2 = lesson.video_url_2;
      if (parts.has("video")) { video = s.videoUrl.trim() || null; patch.video_url = video; }
      if (parts.has("video2")) { video2 = s.videoUrl2.trim() || null; patch.video_url_2 = video2; }
      if (parts.has("notes")) patch.resource_urls = toJson(s.notes);
      if (parts.has("video") || parts.has("video2")) {
        patch.content_type = deriveContentType({ videoUrl: video, videoUrl2: video2 });
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from("lessons").update(patch).eq("id", c.lessonId);
        check(error);
      }
      if (parts.has("quiz")) {
        const { error } = await admin.from("quiz_questions").delete().eq("lesson_id", c.lessonId);
        check(error);
        await insertQuiz(c.lessonId, s);
      }
      applied++;
    }

    for (const c of ofKind("update-module-notes")) {
      const notes = toJson(plan.modules[c.moduleIndex].notes);
      const now = new Date().toISOString();
      // module_notes has one row per module (module_id is its primary key) and no
      // updated_at trigger, so the writer sets updated_at itself.
      const { data: existing, error: readError } = await admin
        .from("module_notes")
        .select("module_id")
        .eq("module_id", c.moduleId)
        .maybeSingle();
      check(readError);
      if (existing) {
        const { error } = await admin
          .from("module_notes")
          .update({ resource_urls: notes, updated_at: now })
          .eq("module_id", c.moduleId);
        check(error);
      } else {
        const { error } = await admin
          .from("module_notes")
          .insert({ module_id: c.moduleId, resource_urls: notes, updated_at: now });
        check(error);
      }
      applied++;
    }

    for (const c of ofKind("remove-session")) {
      const { error } = await admin.from("lessons").delete().eq("id", c.lessonId);
      check(error);
      applied++;
    }
    for (const c of ofKind("remove-module")) {
      const { error } = await admin.from("modules").delete().eq("id", c.moduleId);
      check(error);
      applied++;
    }
  } catch {
    return { ok: false, applied, message: SAVE_FAILED };
  }

  return { ok: true, applied };
}
