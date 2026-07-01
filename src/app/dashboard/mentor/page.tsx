import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/dashboard/StatCard";
import { GraduationCap, Calendar, DollarSign, Clock } from "lucide-react";

export const metadata = { title: "Mentor Dashboard — PZ Academy" };

export default async function MentorDashboard() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "mentor" && profile?.role !== "admin" && profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  const firstName = profile?.full_name?.split(" ")[0] ?? "Mentor";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-montserrat font-bold text-2xl text-pz-forest">Welcome back, {firstName}</h1>
        <p className="text-pz-muted text-sm mt-1">Manage your students and sessions from here.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Students" value={0} icon={GraduationCap} />
        <StatCard label="Sessions This Month" value={0} icon={Calendar} iconBg="bg-pz-pine/10" />
        <StatCard label="Earnings (PKR)" value="—" icon={DollarSign} iconBg="bg-pz-lime/20" />
        <StatCard label="Availability Slots" value={0} icon={Clock} iconBg="bg-pz-frost" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">Upcoming Sessions</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Calendar className="w-10 h-10 text-pz-border mb-3" />
            <p className="text-pz-muted text-sm">No sessions scheduled.</p>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-card p-6">
          <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">My Students</h2>
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <GraduationCap className="w-10 h-10 text-pz-border mb-3" />
            <p className="text-pz-muted text-sm">No active students yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
