import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Reads for the in-app notification bell and history page.
 *
 * RLS (0002, "notifications: own") scopes every select to auth.uid(), so these
 * cannot leak another user's rows even though the queries pass a userId — the
 * argument is for clarity and index use, not for authorisation.
 */

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationSummary {
  items: AppNotification[];
  unreadCount: number;
}

/** How many rows the bell dropdown shows before "View all". */
export const BELL_LIMIT = 8;

/** Cap on the history page — pagination can come later if volume warrants it. */
export const HISTORY_LIMIT = 100;

interface RawNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

function toNotification(row: RawNotification): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

export async function getNotifications(
  userId: string,
  limit: number = HISTORY_LIMIT,
): Promise<AppNotification[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map(toNotification);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  return count ?? 0;
}

/**
 * Everything the bell needs in one place. Called from the dashboard layout and
 * the portal layout, so it runs on most page loads — kept to two indexed
 * queries (notifications_user_created_idx and the partial unread index, both
 * added in 0015).
 */
export async function getNotificationSummary(userId: string): Promise<NotificationSummary> {
  const [items, unreadCount] = await Promise.all([
    getNotifications(userId, BELL_LIMIT),
    getUnreadNotificationCount(userId),
  ]);
  return { items, unreadCount };
}
