import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { type Role } from "@/lib/roles";
import { effectiveAreas, type Area } from "@/lib/team/areas";
import { getCustomAccess } from "@/lib/data/team-access";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { getNotificationSummary } from "@/lib/data/notifications";
import { runInBackground } from "@/lib/landing/registration/background";
import { linkGuestRegistrations } from "@/lib/landing/registration/link-student";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Password sign-ins never pass through /auth/callback, so guest landing registrations are linked
  // here too. In the background and idempotent: it never delays or breaks the dashboard.
  runInBackground(linkGuestRegistrations(user));

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "student") as Role;
  const fullName = profile?.full_name ?? user.email ?? "User";

  // Which admin entries this person may see. Super admin sees all (undefined). If their custom access
  // cannot be read they see no admin entries, never extra ones.
  let areas: Area[] | undefined;
  if (role === "admin" || role === "manager") {
    try {
      areas = effectiveAreas(role, await getCustomAccess(user.id));
    } catch {
      areas = [];
    }
  }
  const { items, unreadCount } = await getNotificationSummary(user.id);

  return (
    <div className="flex min-h-screen bg-pz-surface dark:bg-pz-surface">
      <Sidebar role={role} areas={areas} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          fullName={fullName}
          role={role}
          currentUserId={user.id}
          avatarUrl={profile?.avatar_url ?? null}
          notifications={items}
          unreadCount={unreadCount}
        />
        <main className="flex-1 p-4 sm:p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6">{children}</main>
      </div>
    </div>
  );
}
