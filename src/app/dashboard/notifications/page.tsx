import { redirect } from "next/navigation";
import Link from "next/link";
import { BellOff, Send } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getNotifications, getUnreadNotificationCount } from "@/lib/data/notifications";
import { canSendNotice } from "@/components/dashboard/nav";
import { getViewerRoleAndAreas } from "@/lib/auth/viewer-areas";
import { NotificationHistory } from "@/components/dashboard/NotificationHistory";

export const metadata = { title: "Notifications — PZ Academy" };

export default async function NotificationsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [notifications, unreadCount, viewer] = await Promise.all([
    getNotifications(user.id),
    getUnreadNotificationCount(user.id),
    getViewerRoleAndAreas(supabase, user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">Notifications</h1>
          <p className="font-body text-pz-on-surface-variant text-sm mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}.`
              : "You're all caught up."}
          </p>
        </div>
        {canSendNotice(viewer.role, viewer.areas) && (
          <Link
            href="/dashboard/admin/notifications"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-pz-outline-variant/40 bg-pz-surface-container px-4 font-body font-semibold text-sm text-pz-on-surface hover:bg-pz-surface-container-high"
          >
            <Send className="h-4 w-4" />
            Send a notice
          </Link>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <BellOff className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">
            No notifications yet — updates about your enrollments and lessons will appear here.
          </p>
        </div>
      ) : (
        <NotificationHistory currentUserId={user.id} notifications={notifications} unreadCount={unreadCount} />
      )}
    </div>
  );
}
