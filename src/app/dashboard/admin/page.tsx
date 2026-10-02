import Link from "next/link";
import { StatCard } from "@/components/dashboard/StatCard";
import { Users, BookOpen, Calendar, DollarSign } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { countPendingEnrollments } from "@/lib/data/admin-enrollments";

export const metadata = { title: "Admin Dashboard — PZ Academy" };

export default async function AdminDashboard() {
  await requireAdminPage();
  const pendingCount = await countPendingEnrollments();

  return (
    <div className="space-y-6">
      {pendingCount > 0 && (
        <div className="rounded-xl bg-pz-warning/10 border border-pz-warning/30 px-5 py-3 flex items-center gap-3">
          <span className="text-pz-warning text-lg">⚠️</span>
          <p className="text-sm text-pz-forest font-medium">
            <strong>
              {pendingCount} payment{pendingCount === 1 ? "" : "s"}
            </strong>{" "}
            awaiting verification.
          </p>
          <Link
            href="/dashboard/admin/enrollments"
            className="ml-auto text-xs text-pz-pine font-medium hover:underline"
          >
            Review →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total Students" value={0} icon={Users} />
        <StatCard label="Active Enrollments" value={0} icon={BookOpen} iconBg="bg-pz-solid-pine/10" />
        <StatCard label="Sessions This Month" value={0} icon={Calendar} iconBg="bg-pz-lime/20" />
        <StatCard label="Revenue (PKR)" value="—" icon={DollarSign} iconBg="bg-pz-frost" />
      </div>

      {/* The real queue lives at /dashboard/admin/enrollments. This used to be a
          hardcoded empty table, which would now contradict the banner above. */}
      <div className="bg-pz-surface-container-lowest rounded-xl shadow-card p-6">
        <h2 className="font-montserrat font-bold text-pz-forest text-base">Pending Payments</h2>
        <p className="text-sm text-pz-muted mt-1">
          {pendingCount === 0
            ? "Nothing is awaiting verification right now."
            : `${pendingCount} enrollment${pendingCount === 1 ? "" : "s"} awaiting payment verification.`}
        </p>
        <Link
          href="/dashboard/admin/enrollments"
          className="inline-block mt-4 text-sm text-pz-pine font-semibold hover:underline"
        >
          Open review queue →
        </Link>
      </div>
    </div>
  );
}
