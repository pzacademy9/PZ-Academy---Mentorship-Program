import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createCourse, ensureDefaultModule } from "@/lib/data/admin-lms";
import { usesFlatSessions, type LessonContentType } from "@/lib/validations/admin-lms";
import type { Json } from "@/lib/supabase/database.types";
import { deriveContentType } from "@/lib/lms/lesson-parts";
import type { ImportPlan } from "@/lib/lms/course-import/analyze";

export type CreateFromPlanResult = { ok: true; id: string; slug: string } | { ok: false; reason: "db-error" };

const QUIZ_CHUNK = 500;

function toJson(links: { label: string; url: string }[]): Json {
  return links.map((l) => ({ label: l.label, url: l.url }));
}

/**
 * Creates a draft course from a checked import plan, all or nothing: if any
 * insert fails the new course row is deleted, and every child table cascades
 * from it (modules, lessons, quiz_questions, module_notes are all ON DELETE
 * CASCADE), so nothing is left behind.
 */
export async function createCourseFromPlan(plan: ImportPlan): Promise<CreateFromPlanResult> {
  const created = await createCourse({ title: plan.title, type: plan.type });
  if (!created.ok) return { ok: false, reason: "db-error" };

  const admin = createAdminSupabase();
  const rollback = async (): Promise<CreateFromPlanResult> => {
    await admin.from("courses").delete().eq("id", created.id);
    return { ok: false, reason: "db-error" };
  };

  try {
    const flat = usesFlatSessions(plan.type);
    const moduleRows: { id: string; course_id: string; title: string; order_index: number }[] = [];
    const noteRows: { module_id: string; resource_urls: Json; updated_at: string }[] = [];
    const lessonRows: {
      id: string;
      module_id: string;
      title: string;
      content_type: LessonContentType;
      order_index: number;
      video_url: string | null;
      video_url_2: string | null;
      resource_urls: Json;
    }[] = [];
    const quizRows: {
      lesson_id: string;
      question: string;
      options: string[];
      correct_index: number;
      order_index: number;
    }[] = [];
    const now = new Date().toISOString();

    // Flat types keep every session in the one hidden module, in file order.
    const hiddenModuleId = flat ? await ensureDefaultModule(created.id) : null;
    let flatIndex = 0;

    plan.modules.forEach((m, mi) => {
      let moduleId: string;
      if (hiddenModuleId) {
        moduleId = hiddenModuleId;
      } else {
        moduleId = crypto.randomUUID();
        moduleRows.push({ id: moduleId, course_id: created.id, title: m.title, order_index: mi });
        if (m.notes.length > 0) noteRows.push({ module_id: moduleId, resource_urls: toJson(m.notes), updated_at: now });
      }
      m.sessions.forEach((s, si) => {
        const lessonId = crypto.randomUUID();
        const videoUrl = s.videoUrl.trim() || null;
        const videoUrl2 = s.videoUrl2.trim() || null;
        lessonRows.push({
          id: lessonId,
          module_id: moduleId,
          title: s.title,
          content_type: deriveContentType({ videoUrl, videoUrl2 }),
          order_index: hiddenModuleId ? flatIndex++ : si,
          video_url: videoUrl,
          video_url_2: videoUrl2,
          resource_urls: toJson(s.notes),
        });
        s.questions.forEach((qn, qi) => {
          quizRows.push({
            lesson_id: lessonId,
            question: qn.question,
            options: qn.options,
            correct_index: qn.correctIndex,
            order_index: qi,
          });
        });
      });
    });

    if (moduleRows.length > 0) {
      const { error } = await admin.from("modules").insert(moduleRows);
      if (error) return await rollback();
    }
    if (lessonRows.length > 0) {
      const { error } = await admin.from("lessons").insert(lessonRows);
      if (error) return await rollback();
    }
    if (noteRows.length > 0) {
      const { error } = await admin.from("module_notes").insert(noteRows);
      if (error) return await rollback();
    }
    for (let i = 0; i < quizRows.length; i += QUIZ_CHUNK) {
      const { error } = await admin.from("quiz_questions").insert(quizRows.slice(i, i + QUIZ_CHUNK));
      if (error) return await rollback();
    }
  } catch {
    return await rollback();
  }

  return { ok: true, id: created.id, slug: created.slug };
}
