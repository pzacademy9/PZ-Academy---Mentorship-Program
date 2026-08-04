import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getEnrolledCourses } from "@/lib/data/lms";
import { EnrolledCourseCard } from "@/components/lms/EnrolledCourseCard";

export const metadata = { title: "My Courses — PZ Academy" };

export default async function MyCoursesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const courses = await getEnrolledCourses(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">My Courses</h1>
        <p className="text-pz-muted text-sm mt-1">Continue where you left off.</p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-white rounded-xl shadow-card p-10 flex flex-col items-center text-center">
          <BookOpen className="w-10 h-10 text-pz-border mb-3" />
          <p className="text-pz-muted text-sm">You&apos;re not enrolled in any courses yet.</p>
          <a href="/courses" className="mt-3 text-pz-forest text-sm font-semibold hover:underline">
            Browse courses →
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {courses.map((course) => (
            <EnrolledCourseCard key={course.courseId} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
