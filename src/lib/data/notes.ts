import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export interface LessonNote {
  id: string;
  lessonId: string;
  courseId: string;
  contentHtml: string;
  contentText: string;
  updatedAt: string;
}

export interface NoteSummary {
  id: string;
  lessonId: string;
  courseSlug: string;
  courseTitle: string;
  lessonTitle: string;
  preview: string;
  updatedAt: string;
}

/** Collapses whitespace/newlines and truncates to maxLen chars, appending "…" if cut. */
export function truncatePreview(text: string, maxLen = 150): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen)}…`;
}

/** The caller's note for a lesson, or null if they haven't written one yet. */
export async function getLessonNote(
  lessonId: string,
  studentId: string,
): Promise<LessonNote | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("lesson_notes")
    .select("id, lesson_id, course_id, content_html, content_text, updated_at")
    .eq("lesson_id", lessonId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    lessonId: data.lesson_id,
    courseId: data.course_id,
    contentHtml: data.content_html,
    contentText: data.content_text,
    updatedAt: data.updated_at,
  };
}

/** Upserts the caller's note for a lesson (one row per student per lesson). */
export async function saveLessonNote(input: {
  studentId: string;
  lessonId: string;
  courseId: string;
  html: string;
  text: string;
}): Promise<void> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from("lesson_notes").upsert(
    {
      student_id: input.studentId,
      lesson_id: input.lessonId,
      course_id: input.courseId,
      content_html: input.html,
      content_text: input.text,
    },
    { onConflict: "student_id,lesson_id" },
  );
  if (error) throw error;
}

/** Every note the caller has written, newest first, for the My Notes hub. */
export async function getAllNotes(studentId: string): Promise<NoteSummary[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("lesson_notes")
    .select(
      "id, lesson_id, content_text, updated_at, lessons(title), courses(slug, title)",
    )
    .eq("student_id", studentId)
    .order("updated_at", { ascending: false });

  if (!data) return [];

  return data
    .filter((row) => row.lessons && row.courses)
    .map((row) => ({
      id: row.id,
      lessonId: row.lesson_id,
      courseSlug: row.courses!.slug,
      courseTitle: row.courses!.title,
      lessonTitle: row.lessons!.title,
      preview: truncatePreview(row.content_text),
      updatedAt: row.updated_at,
    }));
}
