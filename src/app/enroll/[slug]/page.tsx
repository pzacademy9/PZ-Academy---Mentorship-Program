import { redirect, notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCourseBySlug, getEnrollment } from "@/lib/data/lms";
import { EnrollmentStatusScreen } from "@/components/lms/EnrollmentStatusScreen";
import { EnrollWizard } from "@/components/enroll/EnrollWizard";

export default async function EnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — middleware already gates /enroll/* for anonymous visitors.
  if (!user) redirect(`/login?returnUrl=/enroll/${slug}`);

  const course = await getCourseBySlug(slug);
  if (!course || !course.isPublished) notFound();

  const enrollment = await getEnrollment(course.id, user.id);

  if (enrollment?.status === "active") {
    redirect(`/portal/${course.slug}`);
  }
  if (enrollment?.status === "pending") {
    return <EnrollmentStatusScreen variant="pending" courseTitle={course.title} />;
  }
  if (enrollment?.status === "rejected" || enrollment?.status === "expired") {
    return <EnrollmentStatusScreen variant="rejected" courseTitle={course.title} />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, profession, city")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-pz-academy-background flex items-center justify-center py-16 px-6">
      <EnrollWizard
        courseSlug={course.slug}
        courseTitle={course.title}
        pricePkr={course.pricePkr}
        profile={{
          fullName: profile?.full_name ?? "",
          email: user.email ?? "",
          phone: profile?.phone ?? null,
          profession: profile?.profession ?? null,
          city: profile?.city ?? null,
        }}
      />
    </div>
  );
}
