import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];

export interface MyEnrollment {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  status: EnrollmentStatus;
  enrolledAt: string;
}

/**
 * The caller's own enrollments, joined to course title/slug.
 * Never selects payment_screenshot_url, verified_by, or rejection_reason —
 * those stay admin/owner-only per RLS and must not round-trip to the client.
 */
export async function getMyEnrollments(userId: string): Promise<MyEnrollment[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("enrollments")
    .select("id, course_id, status, enrolled_at, courses(slug, title)")
    .eq("student_id", userId)
    .order("enrolled_at", { ascending: false });

  if (!data) return [];
  return data
    .filter((e) => e.courses)
    .map((e) => ({
      id: e.id,
      courseId: e.course_id,
      courseSlug: e.courses!.slug,
      courseTitle: e.courses!.title,
      status: e.status,
      enrolledAt: e.enrolled_at,
    }));
}

/** Whether the caller has an active enrollment in a course. */
export async function hasActiveEnrollment(courseId: string, userId: string): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("enrollments")
    .select("id")
    .eq("course_id", courseId)
    .eq("student_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data !== null;
}
