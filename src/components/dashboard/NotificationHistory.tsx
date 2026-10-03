"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellOff, CheckCheck, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { formatDateTime, relativeTime } from "@/lib/format";
import { resolveNotificationStyle } from "./notification-style";
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
  const [isNavigating, startTransition] = useTransition();

  function post(body: Record<string, string>) {
    return fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const { run: handleMarkAll, pending: markingAll } = useAsyncAction(async () => {
    try {
      const res = await post({});
      if (!res.ok) {
        toast.error("Could not mark notifications read.");
        return;
      }
      toast.success("All notifications marked read.");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not mark notifications read.");
    }
  });

  const { run: handleOpen, pending: opening, pendingKey: openingId } = useAsyncAction(
    async (notification: AppNotification) => {
      try {
        if (!notification.isRead) await post({ id: notification.id });
      } catch {
        toast.error("Could not open notification.");
        return;
      }
      startTransition(() => {
        if (notification.link) router.push(notification.link);
        else router.refresh();
      });
    },
    { getKey: (n) => n.id },
  );

  const { run: handleDelete, pending: deleting, pendingKey: deletingId } = useAsyncAction(
    async (id: string) => {
      try {
        const res = await fetch("/api/notifications", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) {
          toast.error("Could not delete notification.");
          return;
        }
        startTransition(() => router.refresh());
      } catch {
        toast.error("Could not delete notification.");
      }
    },
    { getKey: (id) => id },
  );

  const isPending = markingAll || opening || deleting || isNavigating;

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={BellOff}
        title="No notifications yet"
        description="Updates about your enrollments and lessons will appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="bare"
            size="bare"
            loading={markingAll}
            disabled={isPending}
            onClick={() => handleMarkAll()}
            className="gap-2 px-4 py-2 max-md:min-h-11 rounded-lg bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-headline font-semibold text-sm transition-colors"
          >
            <CheckCheck className="w-4 h-4" /> Mark all read
          </Button>
        </div>
      )}

      <ul className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden divide-y divide-pz-outline-variant/30">
        {notifications.map((notification) => {
          const { icon: Icon, circle } = resolveNotificationStyle(notification.type);
          return (
            <li
              key={notification.id}
              className={cn("flex items-start", !notification.isRead && "bg-pz-primary/[0.04]")}
            >
              <button
                type="button"
                onClick={() => void handleOpen(notification)}
                disabled={isPending}
                aria-busy={openingId === notification.id || undefined}
                className="min-w-0 flex-1 text-left p-5 flex gap-4 items-start transition-colors hover:bg-pz-surface-container-high disabled:opacity-60"
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
              <Button
                type="button"
                variant="bare"
                size="bare"
                aria-label="Delete notification"
                loading={deletingId === notification.id}
                disabled={isPending}
                onClick={() => void handleDelete(notification.id)}
                className="shrink-0 self-start mt-2 mr-2 md:mt-4 md:mr-4 p-2 max-md:min-h-11 max-md:min-w-11 rounded-full text-pz-on-surface-variant/60 hover:text-pz-on-surface hover:bg-pz-surface-container-high transition-colors"
              >
                <X className="w-4 h-4" />
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
