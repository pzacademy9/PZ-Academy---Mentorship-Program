import { redirect } from "next/navigation";
import { BellOff } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { getNotifications, getUnreadNotificationCount } from "@/lib/data/notifications";
import { NotificationHistory } from "@/components/dashboard/NotificationHistory";

export const metadata = { title: "Notifications — PZ Academy" };

export default async function NotificationsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(user.id),
    getUnreadNotificationCount(user.id),
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
      </div>

      {notifications.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <BellOff className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">
            No notifications yet — updates about your enrollments and lessons will appear here.
          </p>
        </div>
      ) : (
        <NotificationHistory notifications={notifications} unreadCount={unreadCount} />
      )}
    </div>
  );
}
