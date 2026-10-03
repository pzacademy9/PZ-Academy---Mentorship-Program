import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { type Role } from "@/lib/roles";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { getNotificationSummary } from "@/lib/data/notifications";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "student") as Role;
  const fullName = profile?.full_name ?? user.email ?? "User";
  const { items, unreadCount } = await getNotificationSummary(user.id);

  return (
    <div className="flex min-h-screen bg-pz-surface dark:bg-pz-surface">
      <Sidebar role={role} />
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
