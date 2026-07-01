import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/dashboard/StatCard";
import { Users, BookOpen, Calendar, DollarSign } from "lucide-react";

export const metadata = { title: "Admin Dashboard — PZ Academy" };

export default async function AdminDashboard() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-pz-warning/10 border border-pz-warning/30 px-5 py-3 flex items-center gap-3">
        <span className="text-pz-warning text-lg">⚠️</span>
        <p className="text-sm text-pz-forest font-medium">
          <strong>0 payments</strong> awaiting verification.
        </p>
        <a href="/dashboard/admin/enrollments" className="ml-auto text-xs text-pz-pine font-medium hover:underline">
          Review →
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={0} icon={Users} />
        <StatCard label="Active Enrollments" value={0} icon={BookOpen} iconBg="bg-pz-pine/10" />
        <StatCard label="Sessions This Month" value={0} icon={Calendar} iconBg="bg-pz-lime/20" />
        <StatCard label="Revenue (PKR)" value="—" icon={DollarSign} iconBg="bg-pz-frost" />
      </div>

      <div className="bg-white rounded-xl shadow-card p-6">
        <h2 className="font-montserrat font-bold text-pz-forest text-base mb-4">Pending Payments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-pz-border text-pz-muted text-left">
                <th className="pb-2 font-medium">Student</th>
                <th className="pb-2 font-medium">Course</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="py-12 text-center text-pz-muted">
                  No pending payments.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
