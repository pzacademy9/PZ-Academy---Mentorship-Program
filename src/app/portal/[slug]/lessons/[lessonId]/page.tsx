import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCourseBySlug,
  getEnrollment,
  getCurriculum,
  getLessonForStudent,
  getQuizQuestions,
  getQuizAttempts,
} from "@/lib/data/lms";
import { getLessonNote } from "@/lib/data/notes";
import { CourseSidebar } from "@/components/lms/CourseSidebar";
import { LessonContent } from "@/components/lms/LessonContent";
import { MarkCompleteButton } from "@/components/lms/MarkCompleteButton";
import { EnrollmentStatusScreen } from "@/components/lms/EnrollmentStatusScreen";
import { LessonSidePanel } from "@/components/lms/LessonSidePanel";
import { KnowledgeCheckCard } from "@/components/lms/KnowledgeCheckCard";

export default async function LessonPage({
  params,
}: {
  params: { slug: string; lessonId: string };
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?returnUrl=/portal/${params.slug}`);

  const course = await getCourseBySlug(params.slug);
  if (!course) notFound();

  const enrollment = await getEnrollment(course.id, user.id);
  if (!enrollment) redirect("/courses");
  if (enrollment.status !== "active") {
    return (
      <EnrollmentStatusScreen
        variant={enrollment.status === "pending" ? "pending" : "rejected"}
        courseTitle={course.title}
      />
    );
  }

  const [modules, lesson] = await Promise.all([
    getCurriculum(course.id),
    getLessonForStudent(params.slug, params.lessonId),
  ]);
  if (!lesson) notFound();

  const locked = lesson.status === "locked";
  const lessonNumber =
    modules.flatMap((m) => m.lessons).findIndex((l) => l.lessonId === lesson.id) + 1;

  const [questions, attempts, note] = locked
    ? [[], [], null]
    : await Promise.all([
        lesson.hasQuiz ? getQuizQuestions(lesson.id) : Promise.resolve([]),
        lesson.hasQuiz ? getQuizAttempts(lesson.id, user.id) : Promise.resolve([]),
        getLessonNote(lesson.id, user.id),
      ]);

  return (
    <div className="flex flex-col lg:flex-row">
      {/* Course nav */}
      <aside className="hidden lg:block w-72 shrink-0 border-r border-pz-outline-variant/40 bg-pz-surface-container-low min-h-[calc(100vh-4rem)] sticky top-16 self-start overflow-y-auto max-h-[calc(100vh-4rem)]">
        <CourseSidebar slug={params.slug} modules={modules} />
      </aside>

      {/* Lesson content */}
      <main className="flex-1 min-w-0 bg-pz-surface-dim p-4 sm:p-8 pb-24 lg:pb-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {locked ? (
            <div className="bg-pz-surface-container rounded-2xl shadow-sm border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-pz-on-surface-variant/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-pz-on-surface-variant" />
              </div>
              <p className="font-headline font-semibold text-pz-on-surface text-lg">
                {lesson.title}
              </p>
              <p className="font-headline font-semibold text-pz-on-surface">
                This lesson is locked
              </p>
              <p className="text-sm font-body text-pz-on-surface-variant max-w-sm">
                Complete the previous lesson to unlock this one. Lessons open in sequence as you
                progress.
              </p>
              {lesson.prevLessonId && (
                <Link
                  href={`/portal/${params.slug}/lessons/${lesson.prevLessonId}`}
                  className="mt-2 inline-flex items-center gap-2 text-pz-primary text-sm font-label font-semibold hover:underline"
                >
                  <ChevronLeft className="w-4 h-4" /> Go to previous lesson
                </Link>
              )}
            </div>
          ) : (
            <>
              <div>
                <LessonContent lesson={lesson} />
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mt-5">
                  <div>
                    <h1 className="font-headline font-bold text-2xl sm:text-[28px] text-pz-on-surface leading-tight">
                      {lesson.title}
                    </h1>
                    <p className="font-body text-pz-on-surface-variant text-sm mt-1">
                      Lesson {lessonNumber} &bull; {course.title}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-pz-surface-container rounded-2xl shadow-sm border border-pz-outline-variant/40 p-4">
                {lesson.prevLessonId ? (
                  <Link
                    href={`/portal/${params.slug}/lessons/${lesson.prevLessonId}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant text-pz-on-surface text-sm font-label font-semibold px-4 py-2.5 hover:bg-pz-surface-container-high transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Link>
                ) : (
                  <span />
                )}

                {lesson.hasQuiz ? (
                  <span className="text-sm font-body text-pz-on-surface-variant font-medium text-center px-2">
                    {lesson.status === "completed"
                      ? "Knowledge Check passed ✓"
                      : "Pass the Knowledge Check below to continue"}
                  </span>
                ) : (
                  <MarkCompleteButton
                    courseSlug={params.slug}
                    lessonId={lesson.id}
                    completed={lesson.status === "completed"}
                    hasNext={!!lesson.nextLessonId}
                  />
                )}

                {lesson.nextLessonId ? (
                  <NextButton
                    href={`/portal/${params.slug}/lessons/${lesson.nextLessonId}`}
                    enabled={lesson.status === "completed"}
                  />
                ) : (
                  <span />
                )}
              </div>

              {lesson.hasQuiz && (
                <KnowledgeCheckCard
                  courseSlug={params.slug}
                  lessonId={lesson.id}
                  questions={questions}
                  attempts={attempts}
                  completed={lesson.status === "completed"}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Resources & Quick Notes — sidebar on lg+, stacked card on mobile */}
      {!locked && (
        <LessonSidePanel
          key={lesson.id}
          lessonId={lesson.id}
          courseId={course.id}
          lessonTitle={lesson.title}
          resources={lesson.resources}
          initialNoteHtml={note?.contentHtml ?? ""}
        />
      )}
    </div>
  );
}

function NextButton({ href, enabled }: { href: string; enabled: boolean }) {
  if (!enabled) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border border-pz-outline-variant text-pz-on-surface-variant/60 text-sm font-label font-semibold px-4 py-2.5 cursor-not-allowed"
        title="Complete this lesson to continue"
      >
        Next <ChevronRight className="w-4 h-4" />
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-pz-secondary text-white text-sm font-label font-bold px-4 py-2.5 hover:opacity-90 transition-opacity"
    >
      Next <ChevronRight className="w-4 h-4" />
    </Link>
  );
}
