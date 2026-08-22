import { requireMentorPage } from "@/lib/auth/require-mentor";
import { getOwnMentorProfile } from "@/lib/data/mentor-self";
import {
  getMentorDashboardStats,
  listUpcomingSessionsForMentor,
  listStudentsForMentor,
} from "@/lib/data/mentorship-sessions";
import { StatCard } from "@/components/dashboard/StatCard";
import { UpcomingSessionsList } from "@/components/mentor/UpcomingSessionsList";
import { MyStudentsList } from "@/components/mentor/MyStudentsList";
import { GraduationCap, Calendar, DollarSign, Clock3 } from "lucide-react";

export const metadata = { title: "Mentor Dashboard — PZ Academy" };

export default async function MentorDashboard() {
  const { user, supabase } = await requireMentorPage();

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const firstName = profile?.full_name?.split(" ")[0] ?? "Mentor";

  const mentor = await getOwnMentorProfile(user.id);
  const stats = mentor ? await getMentorDashboardStats(mentor.slug, user.id) : null;
  const upcomingSessions = mentor ? await listUpcomingSessionsForMentor(user.id) : [];
  const students = mentor ? await listStudentsForMentor(user.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Welcome back, {firstName}</h1>
        <p className="text-pz-muted text-sm mt-1">Manage your students and sessions from here.</p>
      </div>

      {!mentor && (
        <div className="bg-white rounded-xl shadow-card p-6">
          <p className="text-pz-muted text-sm">
            No mentor profile is linked to your account yet. Contact an admin to get set up.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Students" value={stats?.activeStudents ?? 0} icon={GraduationCap} />
        <StatCard label="Sessions This Month" value={stats?.sessionsThisMonth ?? 0} icon={Calendar} iconBg="bg-pz-pine/10" />
        <StatCard label="Earnings (PKR)" value="—" icon={DollarSign} iconBg="bg-pz-lime/20" />
        <StatCard label="Pending Bookings" value={stats?.pendingBookings ?? 0} icon={Clock3} iconBg="bg-pz-frost" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">Upcoming Sessions</h2>
          <UpcomingSessionsList sessions={upcomingSessions} />
        </div>
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">My Students</h2>
          <MyStudentsList students={students} />
        </div>
      </div>
    </div>
  );
}
