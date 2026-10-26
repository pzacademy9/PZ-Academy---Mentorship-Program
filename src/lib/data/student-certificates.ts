import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { CertSourceError, getCertsByEmail } from "@/lib/certs/cert-source";
import { isIssuedForStudent, normEmail, type CertRecord } from "@/lib/certs/cert-model";
import { countFinishedCourses } from "@/lib/students/student-metrics";

export type MyCertificates =
  | { state: "ok"; issued: CertRecord[]; pendingCount: number }
  | { state: "unavailable" };

export async function getMyCertificates(): Promise<MyCertificates> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let all: CertRecord[];
  try {
    all = await getCertsByEmail(normEmail(user.email));
  } catch (e) {
    if (e instanceof CertSourceError) return { state: "unavailable" };
    throw e;
  }

  const issued = all.filter(isIssuedForStudent);
  const issuedGeneral = issued.filter((c) => c.category === "General").length;

  // Finished courses: active enrollments whose every lesson is completed. Set-based queries.
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id")
    .eq("student_id", user.id)
    .eq("status", "active");
  const courseIds = Array.from(new Set((enrollments ?? []).map((e) => e.course_id)));

  let finished = 0;
  if (courseIds.length > 0) {
    const { data: modules } = await supabase.from("modules").select("id, course_id").in("course_id", courseIds);
    const moduleCourse = new Map((modules ?? []).map((m) => [m.id, m.course_id]));
    const moduleIds = Array.from(moduleCourse.keys());
    const { data: lessons } = moduleIds.length
      ? await supabase.from("lessons").select("id, module_id").in("module_id", moduleIds)
      : { data: [] as { id: string; module_id: string }[] };
    const { data: done } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("student_id", user.id)
      .eq("status", "completed");

    const lessonIdsByCourse = new Map<string, string[]>(courseIds.map((id) => [id, []]));
    for (const l of lessons ?? []) {
      const cid = moduleCourse.get(l.module_id);
      if (cid) lessonIdsByCourse.get(cid)?.push(l.id);
    }
    finished = countFinishedCourses(
      courseIds.map((courseId) => ({ courseId, lessonIds: lessonIdsByCourse.get(courseId) ?? [] })),
      new Set((done ?? []).map((d) => d.lesson_id)),
    );
  }

  return { state: "ok", issued, pendingCount: Math.max(0, finished - issuedGeneral) };
}
