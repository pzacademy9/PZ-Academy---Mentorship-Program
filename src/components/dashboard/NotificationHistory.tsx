"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/format";
import { resolveNotificationStyle } from "./notification-style";
import { useBroadcastChannel } from "@/lib/realtime/useBroadcastChannel";
import type { AppNotification } from "@/lib/data/notifications";

/**
 * Full notification history. Same item treatment as the bell dropdown, but
 * roomier and with an absolute timestamp alongside the relative one — this is
 * the surface people use to answer "when exactly was I approved?".
 */
export function NotificationHistory({
  currentUserId,
  notifications,
  unreadCount,
}: {
  currentUserId: string;
  notifications: AppNotification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Same live-refresh as NotificationBell -- see its useBroadcastChannel call
  // for why no local upsert is needed here either.
  useBroadcastChannel<unknown>(`notifications:${currentUserId}`, "INSERT", () => {
    router.refresh();
  });

  function post(body: Record<string, string>) {
    return fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function handleMarkAll() {
    startTransition(async () => {
      const res = await post({});
      if (!res.ok) {
        toast.error("Could not mark notifications read.");
        return;
      }
      toast.success("All notifications marked read.");
      router.refresh();
    });
  }

  function handleOpen(notification: AppNotification) {
    startTransition(async () => {
      if (!notification.isRead) await post({ id: notification.id });
      if (notification.link) router.push(notification.link);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-headline font-semibold text-sm transition-colors disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        </div>
      )}

      <ul className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden divide-y divide-pz-outline-variant/30">
        {notifications.map((notification) => {
          const { icon: Icon, circle } = resolveNotificationStyle(notification.type);
          return (
            <li key={notification.id}>
              <button
                type="button"
                onClick={() => handleOpen(notification)}
                disabled={isPending}
                className={cn(
                  "w-full text-left p-5 flex gap-4 items-start transition-colors hover:bg-pz-surface-container-high disabled:opacity-60",
                  !notification.isRead && "bg-pz-primary/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                    circle,
                  )}
                >
                  <Icon className="w-5 h-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-headline font-bold text-pz-on-surface text-sm">
                      {notification.title}
                    </span>
                    {!notification.isRead && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-pz-primary/15 text-pz-primary text-[10px] font-bold uppercase tracking-wider">
                        New
                      </span>
                    )}
                  </span>
                  {notification.body && (
                    <span className="block font-body text-sm text-pz-on-surface-variant mt-0.5">
                      {notification.body}
                    </span>
                  )}
                  <span className="block font-label text-[11px] text-pz-on-surface-variant/80 mt-1.5">
                    {relativeTime(notification.createdAt)} · {formatDateTime(notification.createdAt)}
                  </span>
                </span>

                {notification.link && (
                  <ChevronRight className="shrink-0 w-4 h-4 mt-1 text-pz-on-surface-variant/60" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
