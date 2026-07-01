import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/dashboard/StatCard";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">
          {greeting()}, {firstName} 👋
        </h1>
        <p className="text-pz-muted text-sm mt-1">Here&apos;s what&apos;s happening with your learning journey.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Enrolled Courses" value={0} icon={BookOpen} />
        <StatCard label="Sessions Booked" value={0} icon={Calendar} iconBg="bg-pz-pine/10" />
        <StatCard label="Certificates" value={0} icon={Award} iconBg="bg-pz-lime/20" />
        <StatCard label="Attendance %" value="—" icon={BarChart3} iconBg="bg-pz-frost" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">My Courses</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <BookOpen className="w-10 h-10 text-pz-border mb-3" />
            <p className="text-pz-muted text-sm">No courses enrolled yet.</p>
            <a href="/courses" className="mt-3 text-pz-pine text-sm font-medium hover:underline">Browse courses →</a>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">Upcoming Sessions</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Calendar className="w-10 h-10 text-pz-border mb-3" />
            <p className="text-pz-muted text-sm">No sessions scheduled.</p>
            <a href="/dashboard/sessions" className="mt-3 text-pz-pine text-sm font-medium hover:underline">Book a session →</a>
          </div>
        </div>
      </div>
    </div>
  );
}
