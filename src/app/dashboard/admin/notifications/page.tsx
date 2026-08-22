import { requireAdminPage } from "@/lib/auth/require-admin";
import { ComposeNotificationForm } from "@/components/admin/ComposeNotificationForm";
import { PurgeNotificationsCard } from "@/components/admin/PurgeNotificationsCard";

export const metadata = { title: "Send Notice — PZ Academy" };

export default async function AdminNotificationsPage() {
  const { supabase } = await requireAdminPage();

  // Both lists are small and admin-readable under existing RLS (0002).
  const [{ data: courses }, { data: students }] = await Promise.all([
    supabase.from("courses").select("id, title").order("title"),
    supabase.from("profiles").select("id, full_name").eq("role", "student").order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Send Notice</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          Push an in-app notification to one student, a course, or everyone.
        </p>
      </div>

      <ComposeNotificationForm
        courses={(courses ?? []).map((c) => ({ id: c.id, title: c.title }))}
        students={(students ?? []).map((s) => ({
          id: s.id,
          name: s.full_name?.trim() || "Unnamed student",
        }))}
      />

      <PurgeNotificationsCard />
    </div>
  );
}
