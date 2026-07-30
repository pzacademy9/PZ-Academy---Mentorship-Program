import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCourseBySlug,
  getEnrollment,
  getOrderedLessons,
  resumeLessonId,
} from "@/lib/data/lms";
import { EnrollmentStatusScreen } from "@/components/lms/EnrollmentStatusScreen";

export default async function PortalEntryPage({ params }: { params: { slug: string } }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?returnUrl=/portal/${params.slug}`);

  const course = await getCourseBySlug(params.slug);
  if (!course) notFound();

  const enrollment = await getEnrollment(course.id, user.id);

  // Not enrolled → upsell (Phase 4 will have a real /courses/[slug] detail page)
  if (!enrollment) redirect("/courses");

  // Allowlist, not a denylist: 'active' is the ONLY status that gets content.
  // Anything else renders its own status screen. Listing the blocked statuses
  // instead would mean every future enrollment_status silently defaults to
  // full course access.
  if (enrollment.status !== "active") {
    return (
      <EnrollmentStatusScreen
        variant={enrollment.status}
        courseTitle={course.title}
        shortfallPkr={enrollment.payment_shortfall_pkr}
      />
    );
  }

  // Active → jump to the resume lesson
  const lessons = await getOrderedLessons(course.id);
  const lessonId = resumeLessonId(lessons);
  if (!lessonId) {
    return (
      <div className="p-10 text-center text-pz-muted">
        This course has no lessons yet. Please check back soon.
      </div>
    );
  }
  redirect(`/portal/${params.slug}/lessons/${lessonId}`);
}
