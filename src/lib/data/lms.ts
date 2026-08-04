import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type ProgressStatus = Database["public"]["Enums"]["progress_status"];
export type LessonContentType = Database["public"]["Enums"]["lesson_content_type"];

export interface EnrolledCourse {
  courseId: string;
  slug: string;
  title: string;
  thumbnailUrl: string | null;
  description: string | null;
  completed: number;
  total: number;
  pct: number;
}

export type CourseType = Database["public"]["Enums"]["course_type"];
export type CourseStatus = Database["public"]["Enums"]["course_status"];

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  type: CourseType;
  status: CourseStatus;
  tagline: string | null;
  thumbnailUrl: string | null;
  level: string | null;
  /** Free-text label, e.g. "8 Weeks" / "4 Days" — see duration_text on courses. */
  durationLabel: string | null;
  pricePkr: number;
  mentorName: string | null;
  mentorTitle: string | null;
  mentorAvatarUrl: string | null;
  /** Freely watchable preview/recording video — see the comment on courses.public_video_url. */
  publicVideoUrl: string | null;
}

export interface CourseFaq {
  question: string;
  answer: string;
}

export interface CourseDetail extends CourseCard {
  description: string | null;
  bannerUrl: string | null;
  features: string[];
  outcomes: string[];
  registerUrl: string | null;
  mentorBio: string | null;
  faqs: CourseFaq[];
  isPublished: boolean;
  timings: string | null;
}

/** duration_text is the admin-editable field; duration_weeks is a read-only fallback for rows not yet re-saved since migration 0022. */
function durationLabel(durationText: string | null, durationWeeks: number | null): string | null {
  if (durationText) return durationText;
  if (durationWeeks != null) return `${durationWeeks} Weeks`;
  return null;
}

export interface CurriculumLesson {
  lessonId: string;
  title: string;
  order: number;
  contentType: LessonContentType;
  status: ProgressStatus;
  hasQuiz: boolean;
}

export interface LessonResource {
  label: string;
  url: string;
}

/** A Supporting Document — a PRIVATE Drive file streamed via /api/lessons/[id]/documents/[fileId]. */
export interface LessonDocument {
  name: string;
  fileId: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  order: number;
}

export interface CurriculumModule {
  moduleId: string;
  title: string;
  order: number;
  lessons: CurriculumLesson[];
}

export interface LessonView {
  id: string;
  title: string;
  contentType: LessonContentType;
  videoUrl: string | null;
  textContent: string | null;
  pdfUrl: string | null;
  pdfFileId: string | null;
  resources: LessonResource[];
  documents: LessonDocument[];
  hasQuiz: boolean;
  status: ProgressStatus;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
}

/** Active enrollments for a student, joined to course + completion %. */
export async function getEnrolledCourses(userId: string): Promise<EnrolledCourse[]> {
  const supabase = await createServerSupabase();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, courses(id, slug, title, thumbnail_url, description)")
    .eq("student_id", userId)
    .eq("status", "active");

  if (!enrollments?.length) return [];

  const result: EnrolledCourse[] = [];
  for (const e of enrollments) {
    const course = e.courses;
    if (!course) continue;
    const { completed, total, pct } = await getCourseProgress(course.id, userId);
    result.push({
      courseId: course.id,
      slug: course.slug,
      title: course.title,
      thumbnailUrl: course.thumbnail_url,
      description: course.description,
      completed,
      total,
      pct,
    });
  }
  return result;
}

/**
 * A published course by slug (or any course for admins per RLS), with the
 * full catalog/detail field set. Anon-safe: the "courses: public read
 * published" RLS policy allows this for any is_published course.
 */
export async function getCourseBySlug(slug: string): Promise<CourseDetail | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("courses")
    .select(
      "id, slug, title, type, status, description, price_pkr, thumbnail_url, banner_url, tagline, level, duration_text, duration_weeks, timings, features, outcomes, register_url, mentor_name, mentor_title, mentor_bio, mentor_avatar_url, faqs, is_published, public_video_url",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    title: data.title,
    type: data.type,
    status: data.status,
    description: data.description,
    pricePkr: data.price_pkr,
    thumbnailUrl: data.thumbnail_url,
    bannerUrl: data.banner_url,
    tagline: data.tagline,
    level: data.level,
    durationLabel: durationLabel(data.duration_text, data.duration_weeks),
    timings: data.timings,
    features: data.features,
    outcomes: data.outcomes,
    registerUrl: data.register_url,
    mentorName: data.mentor_name,
    mentorTitle: data.mentor_title,
    mentorBio: data.mentor_bio,
    mentorAvatarUrl: data.mentor_avatar_url,
    faqs: (data.faqs as unknown as CourseFaq[] | null) ?? [],
    isPublished: data.is_published,
    publicVideoUrl: data.public_video_url,
  };
}

/**
 * Every published course, for the public catalog grid — optionally narrowed
 * to one CourseType so /courses, /workshops, and /webinars can each show only
 * their own type from the same table. Anon-safe (same RLS policy as
 * getCourseBySlug).
 */
export async function getPublishedCourses(type?: CourseType): Promise<CourseCard[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("courses")
    .select(
      "id, slug, title, type, status, tagline, thumbnail_url, level, duration_text, duration_weeks, price_pkr, mentor_name, mentor_title, mentor_avatar_url, public_video_url",
    )
    .eq("is_published", true);
  if (type) query = query.eq("type", type);
  const { data } = await query.order("created_at", { ascending: true });

  if (!data) return [];
  return data.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    type: c.type,
    status: c.status,
    tagline: c.tagline,
    thumbnailUrl: c.thumbnail_url,
    level: c.level,
    durationLabel: durationLabel(c.duration_text, c.duration_weeks),
    pricePkr: c.price_pkr,
    mentorName: c.mentor_name,
    mentorTitle: c.mentor_title,
    mentorAvatarUrl: c.mentor_avatar_url,
    publicVideoUrl: c.public_video_url,
  }));
}

/** The caller's enrollment for a course (or null). */
export async function getEnrollment(courseId: string, userId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("enrollments")
    .select("id, status, payment_shortfall_pkr")
    .eq("course_id", courseId)
    .eq("student_id", userId)
    .maybeSingle();
  return data;
}

/**
 * Curriculum tree (module → lessons) with per-student lock status.
 * Titles only, no content — served by the course_curriculum RPC.
 */
export async function getCurriculum(courseId: string): Promise<CurriculumModule[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("course_curriculum", { p_course_id: courseId });
  if (!data) return [];

  const modules = new Map<string, CurriculumModule>();
  for (const row of data) {
    let mod = modules.get(row.module_id);
    if (!mod) {
      mod = {
        moduleId: row.module_id,
        title: row.module_title,
        order: row.module_order,
        lessons: [],
      };
      modules.set(row.module_id, mod);
    }
    mod.lessons.push({
      lessonId: row.lesson_id,
      title: row.lesson_title,
      order: row.lesson_order,
      contentType: row.content_type,
      status: row.status,
      hasQuiz: row.has_quiz,
    });
  }
  return Array.from(modules.values());
}

/** Flat, ordered list of lessons in a course (id + status), from the curriculum RPC. */
export async function getOrderedLessons(courseId: string): Promise<CurriculumLesson[]> {
  const modules = await getCurriculum(courseId);
  return modules.flatMap((m) => m.lessons);
}

/**
 * Full lesson content for a student. RLS only returns the content row when the
 * caller has an unlocked/completed progress row for it, so a locked lesson
 * yields `null` here (defence in depth with the page-level lock check).
 */
export async function getLessonForStudent(
  courseSlug: string,
  lessonId: string,
): Promise<LessonView | null> {
  const supabase = await createServerSupabase();

  const course = await getCourseBySlug(courseSlug);
  if (!course) return null;

  // Ordered lessons drive prev/next + carry the per-student status.
  const ordered = await getOrderedLessons(course.id);
  const idx = ordered.findIndex((l) => l.lessonId === lessonId);
  if (idx === -1) return null;
  const meta = ordered[idx];

  // Content columns — gated by RLS on lesson status.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, title, content_type, video_url, text_content, pdf_url, pdf_file_id, resource_urls, documents")
    .eq("id", lessonId)
    .maybeSingle();

  return {
    id: meta.lessonId,
    title: lesson?.title ?? meta.title,
    contentType: lesson?.content_type ?? meta.contentType,
    videoUrl: lesson?.video_url ?? null,
    textContent: lesson?.text_content ?? null,
    pdfUrl: lesson?.pdf_url ?? null,
    pdfFileId: lesson?.pdf_file_id ?? null,
    resources: (lesson?.resource_urls as unknown as LessonResource[] | null) ?? [],
    documents: (lesson?.documents as unknown as LessonDocument[] | null) ?? [],
    hasQuiz: meta.hasQuiz,
    status: meta.status,
    courseId: course.id,
    courseSlug: course.slug,
    courseTitle: course.title,
    prevLessonId: idx > 0 ? ordered[idx - 1].lessonId : null,
    nextLessonId: idx < ordered.length - 1 ? ordered[idx + 1].lessonId : null,
  };
}

/** Quiz questions for a lesson (no answer key — server-scored via submitQuizAttempt). */
export async function getQuizQuestions(lessonId: string): Promise<QuizQuestion[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("get_quiz", { p_lesson_id: lessonId });
  if (!data) return [];
  return data.map((row) => ({
    id: row.question_id,
    question: row.question,
    options: row.options as unknown as string[],
    order: row.order_index,
  }));
}

/** The caller's quiz attempts for a lesson, most recent first. */
export async function getQuizAttempts(lessonId: string, userId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("quiz_attempts")
    .select("score, total, passed, attempt_number, created_at")
    .eq("lesson_id", lessonId)
    .eq("student_id", userId)
    .order("attempt_number", { ascending: false });
  return data ?? [];
}

/** {completed, total, pct} for a course/student. */
export async function getCourseProgress(
  courseId: string,
  userId: string,
): Promise<{ completed: number; total: number; pct: number }> {
  const lessons = await getOrderedLessons(courseId);
  const total = lessons.length;
  const completed = lessons.filter((l) => l.status === "completed").length;
  const pct = total === 0 ? 0 : Math.floor((completed / total) * 100);
  return { completed, total, pct };
}

/** First not-completed unlocked lesson (resume point), else first lesson. */
export function resumeLessonId(lessons: CurriculumLesson[]): string | null {
  if (!lessons.length) return null;
  const unlocked = lessons.find((l) => l.status === "unlocked");
  if (unlocked) return unlocked.lessonId;
  const lastCompleted = [...lessons].reverse().find((l) => l.status === "completed");
  return (lastCompleted ?? lessons[0]).lessonId;
}
