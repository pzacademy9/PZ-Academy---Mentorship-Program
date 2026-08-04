import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/dashboard/StatCard";
import { EnrolledCourseCard } from "@/components/lms/EnrolledCourseCard";
import { getEnrolledCourses } from "@/lib/data/lms";
import { BookOpen, Calendar, Award, BarChart3 } from "lucide-react";

export const metadata = { title: "Dashboard — PZ Academy" };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function StudentDashboard() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const courses = await getEnrolledCourses(user.id);

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden p-6 sm:p-8 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10">
        <div className="relative z-10">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">
            {greeting()}, {firstName}.
          </h1>
          <p className="font-body text-pz-on-surface-variant mt-2 max-w-xl">
            Here&apos;s what&apos;s happening with your learning journey.
          </p>
        </div>
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-pz-primary/10 blur-[80px] rounded-full" />
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Enrolled Courses" value={courses.length} icon={BookOpen} />
        <StatCard label="Sessions Booked" value={0} icon={Calendar} />
        <StatCard label="Certificates" value={0} icon={Award} />
        <StatCard label="Attendance %" value="—" icon={BarChart3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-6 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline font-bold text-pz-on-surface text-base">My Courses</h2>
            {courses.length > 0 && (
              <a href="/dashboard/courses" className="font-label text-pz-secondary text-sm font-bold hover:underline">
                View all →
              </a>
            )}
          </div>
          {courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <BookOpen className="w-10 h-10 text-pz-outline-variant mb-3" />
              <p className="font-body text-pz-on-surface-variant text-sm">No courses enrolled yet.</p>
              <a href="/courses" className="mt-3 font-label text-pz-primary text-sm font-bold hover:underline">Browse courses →</a>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {courses.slice(0, 4).map((course) => (
                <EnrolledCourseCard key={course.courseId} course={course} />
              ))}
            </div>
          )}
        </div>
        <div className="p-6 rounded-xl bg-pz-surface-container border border-pz-outline-variant/10">
          <h2 className="font-headline font-bold text-pz-on-surface text-base mb-4">Upcoming Sessions</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Calendar className="w-10 h-10 text-pz-outline-variant mb-3" />
            <p className="font-body text-pz-on-surface-variant text-sm">No sessions scheduled.</p>
            <a href="/dashboard/sessions" className="mt-3 font-label text-pz-primary text-sm font-bold hover:underline">Book a session →</a>
          </div>
        </div>
      </div>
    </div>
  );
}
