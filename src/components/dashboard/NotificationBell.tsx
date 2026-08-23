"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { resolveNotificationStyle } from "./notification-style";
import { useBroadcastChannel } from "@/lib/realtime/useBroadcastChannel";
import type { AppNotification } from "@/lib/data/notifications";

export function NotificationBell({
  currentUserId,
  items = [],
  unreadCount = 0,
}: {
  currentUserId: string;
  items?: AppNotification[];
  unreadCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A new notification (from any source: enrollment triggers, admin
  // broadcast, mentorship feedback, sheet-sync) refreshes this component's
  // server props so the bell updates without waiting for the user's next
  // navigation. No local upsert needed -- items/unreadCount already flow
  // purely from server props plus router.refresh(), same as handleMarkAll.
  useBroadcastChannel<unknown>(`notifications:${currentUserId}`, {
    INSERT: () => router.refresh(),
  });

  function markRead(id?: string) {
    return fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
  }

  function handleMarkAll() {
    startTransition(async () => {
      const res = await markRead();
      if (!res.ok) {
        toast.error("Could not mark notifications read.");
        return;
      }
      router.refresh();
    });
  }

  function handleOpen(notification: AppNotification) {
    startTransition(async () => {
      // Awaited rather than fire-and-forget: navigating away can abort an
      // in-flight request, which would leave the row unread.
      if (!notification.isRead) await markRead(notification.id);
      if (notification.link) router.push(notification.link);
      else router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toast.error("Could not delete notification.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications, none unread"
        }
        className="relative p-2 rounded-full text-pz-on-surface-variant hover:text-pz-on-surface hover:bg-pz-surface-container-high transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary/30"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-pz-secondary-container border-2 border-pz-surface" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-pz-outline-variant/60">
          <h3 className="font-headline font-bold text-pz-on-surface text-base">Notifications</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={isPending}
              className="font-label text-sm text-pz-secondary hover:underline disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center font-body text-sm text-pz-on-surface-variant">
              Nothing yet. Updates about your enrollments and lessons show up here.
            </p>
          ) : (
            items.map((notification) => {
              const { icon: Icon, circle } = resolveNotificationStyle(notification.type);
              return (
                <div
                  key={notification.id}
                  className={cn(
                    "flex gap-1 border-b border-pz-outline-variant/30 last:border-0",
                    !notification.isRead && "bg-pz-primary/[0.04]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleOpen(notification)}
                    disabled={isPending}
                    className="min-w-0 flex-1 text-left p-4 flex gap-3 transition-colors hover:bg-pz-surface-container-high disabled:opacity-60"
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
                      <span className="block font-body text-sm text-pz-on-surface">
                        <span className="font-bold">{notification.title}</span>
                        {notification.body ? ` — ${notification.body}` : ""}
                      </span>
                      <span className="block font-label text-[10px] text-pz-on-surface-variant mt-1">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </span>
                    {!notification.isRead && (
                      <span
                        aria-hidden
                        className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-pz-primary"
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete notification"
                    onClick={() => handleDelete(notification.id)}
                    disabled={isPending}
                    className="shrink-0 self-start mt-3 mr-2 p-1.5 rounded-full text-pz-on-surface-variant/60 hover:text-pz-on-surface hover:bg-pz-surface-container-high transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 bg-pz-surface-container-lowest text-center border-t border-pz-outline-variant/40">
          <Link
            href="/dashboard/notifications"
            className="font-label text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
          >
            View all activity
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
