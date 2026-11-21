import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { AdminToolCards } from "@/components/dashboard/AdminToolCards";
import { toolsForRole } from "@/components/dashboard/nav";
import { getViewerRoleAndAreas } from "@/lib/auth/viewer-areas";
import { BackupStatusCard } from "@/components/dashboard/BackupStatusCard";
import { getBackupHealth } from "@/lib/data/backups";

export const metadata = { title: "Settings — PZ Academy" };

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const { role, areas } = await getViewerRoleAndAreas(supabase, user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Settings</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Manage your profile.</p>
      </div>
      <SettingsForm
        userId={user.id}
        initialFullName={profile?.full_name ?? ""}
        initialAvatarUrl={profile?.avatar_url ?? ""}
      />
      {role === "admin" || role === "super_admin" ? <BackupStatusCard health={await getBackupHealth()} /> : null}
      <AdminToolCards tools={toolsForRole(role, areas)} />
    </div>
  );
}
