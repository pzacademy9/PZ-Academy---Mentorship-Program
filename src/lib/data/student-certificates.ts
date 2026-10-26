import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { CertSourceError, getCertsByEmail } from "@/lib/certs/cert-source";
import { isIssuedForStudent, normEmail, type CertRecord } from "@/lib/certs/cert-model";
import { countFinishedCourses } from "@/lib/students/student-metrics";

const PAGE = 1000;
const CHUNK = 200;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Reads every page; returns null if any page errors, so a truncated read is impossible. */
async function fetchAll<T>(build: (from: number, to: number) => Page<T>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error || !data) return null;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export type MyCertificates =
  | { state: "ok"; issued: CertRecord[]; pendingCount: number }
  | { state: "unverified" }
  | { state: "unavailable" };

export async function getMyCertificates(): Promise<MyCertificates> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Only a confirmed email may be matched to certificates (same rule as link-student).
  if (!user.email || !user.email_confirmed_at) return { state: "unverified" };

  let all: CertRecord[];
  try {
    all = await getCertsByEmail(normEmail(user.email));
  } catch (e) {
    if (e instanceof CertSourceError) return { state: "unavailable" };
    throw e;
  }

  const issued = all.filter(isIssuedForStudent);
  const issuedGeneral = issued.filter((c) => c.category === "General").length;

  // Finished courses: active enrollments whose every lesson is completed.
  // Any query error means "unavailable", never a wrong count.
  const enrollments = await fetchAll<{ id: string; course_id: string }>((from, to) =>
    supabase
      .from("enrollments")
      .select("id, course_id")
      .eq("student_id", user.id)
      .eq("status", "active")
      .order("id")
      .range(from, to),
  );
  if (!enrollments) return { state: "unavailable" };
  const courseIds = Array.from(new Set(enrollments.map((e) => e.course_id)));

  let finished = 0;
  if (courseIds.length > 0) {
    const modules = await fetchAll<{ id: string; course_id: string }>((from, to) =>
      supabase.from("modules").select("id, course_id").in("course_id", courseIds).order("id").range(from, to),
    );
    if (!modules) return { state: "unavailable" };
    const moduleCourse = new Map(modules.map((m) => [m.id, m.course_id]));
    const moduleIds = Array.from(moduleCourse.keys());

    const lessons: { id: string; module_id: string }[] = [];
    for (const ids of chunk(moduleIds, CHUNK)) {
      const part = await fetchAll<{ id: string; module_id: string }>((from, to) =>
        supabase.from("lessons").select("id, module_id").in("module_id", ids).order("id").range(from, to),
      );
      if (!part) return { state: "unavailable" };
      lessons.push(...part);
    }

    const done = new Set<string>();
    for (const ids of chunk(lessons.map((l) => l.id), CHUNK)) {
      const part = await fetchAll<{ id: string; lesson_id: string }>((from, to) =>
        supabase
          .from("lesson_progress")
          .select("id, lesson_id")
          .eq("student_id", user.id)
          .eq("status", "completed")
          .in("lesson_id", ids)
          .order("id")
          .range(from, to),
      );
      if (!part) return { state: "unavailable" };
      for (const d of part) done.add(d.lesson_id);
    }

    const lessonIdsByCourse = new Map<string, string[]>(courseIds.map((id) => [id, []]));
    for (const l of lessons) {
      const cid = moduleCourse.get(l.module_id);
      if (cid) lessonIdsByCourse.get(cid)?.push(l.id);
    }
    finished = countFinishedCourses(
      courseIds.map((courseId) => ({ courseId, lessonIds: lessonIdsByCourse.get(courseId) ?? [] })),
      done,
    );
  }

  return { state: "ok", issued, pendingCount: Math.max(0, finished - issuedGeneral) };
}
