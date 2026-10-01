"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useBroadcastChannel } from "@/lib/realtime/useBroadcastChannel";
import { formatTime } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MessageRow } from "@/lib/data/mentor-messaging";

/** Inserts a message if its id isn't already present, keeping the array sorted by createdAt -- shared by the realtime handler, the direct-append-from-response path, and the reconciliation effect below, so a message can never appear twice or out of order regardless of which path delivered it first. */
function upsertMessage(prev: MessageRow[], next: MessageRow): MessageRow[] {
  if (prev.some((m) => m.id === next.id)) return prev;
  return [...prev, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Shape of the row broadcast by migration 0042/0044's trigger on mentor_messages -- INSERT sends the new row, DELETE sends the deleted row (see 0044's function). */
type BroadcastMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

/** Where a message sits within a run of consecutive same-sender messages -- drives spacing, corner rounding, and whether the avatar/timestamp show. Matches the Stitch "Message Thread" reference: only the last bubble in a cluster carries a timestamp (and, for the counterpart's side, the avatar). */
function clusterPosition(messages: MessageRow[], index: number): { isFirst: boolean; isLast: boolean } {
  const prev = messages[index - 1];
  const next = messages[index + 1];
  const current = messages[index];
  return {
    isFirst: !prev || prev.senderId !== current.senderId,
    isLast: !next || next.senderId !== current.senderId,
  };
}

/** Tail-side corner rounding for a bubble at a given cluster position -- side is "l" for the counterpart's left-aligned bubbles, "r" for the current user's right-aligned ones. Singleton and first-in-cluster share one shape (matches the reference exactly); middle messages sharpen both tail corners; the last message closes the cluster with a medium round. */
function bubbleCorners(side: "l" | "r", isFirst: boolean, isLast: boolean): string {
  if (isFirst && isLast) return `rounded-2xl rounded-b${side}-sm`;
  if (isFirst) return `rounded-2xl rounded-b${side}-sm`;
  if (isLast) return `rounded-2xl rounded-t${side}-sm rounded-b${side}-md`;
  return `rounded-2xl rounded-t${side}-sm rounded-b${side}-sm`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function MessageThread({
  conversationId,
  initialMessages,
  currentUserId,
  counterpartName,
  counterpartAvatarUrl,
  canMessage,
  sendUrl,
}: {
  conversationId: string | null;
  initialMessages: MessageRow[];
  currentUserId: string;
  counterpartName: string;
  counterpartAvatarUrl?: string | null;
  canMessage: boolean;
  sendUrl: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isTransitioning, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  // Ids removed locally (delete-for-me / delete-for-everyone / clear) that
  // must never come back. NotificationBell's own realtime hook lives on
  // this same page and calls router.refresh() independently of anything
  // here -- if that refresh's server fetch was in flight before a delete
  // committed, it hands back a stale initialMessages that still contains
  // the row, and the additive merge below would otherwise resurrect it.
  const removedIdsRef = useRef<Set<string>>(new Set());

  // Reconciles state with fresh server props on every render where
  // initialMessages changed -- the only way router.refresh() can actually
  // repair a thread that went stale (subscription never opened, dropped,
  // or errored silently). useState(initialMessages) only consumes its
  // argument on mount, so without this merge a refresh's fresh message
  // list would otherwise be silently discarded.
  useEffect(() => {
    setMessages((prev) =>
      initialMessages.reduce(upsertMessage, prev).filter((m) => !removedIdsRef.current.has(m.id)),
    );
  }, [initialMessages]);

  // The only client-side Supabase Realtime subscription in this codebase --
  // every other data flow goes through a server route. Only subscribes once
  // a real conversationId exists; a brand-new thread (nobody has sent a
  // message yet) has nothing to subscribe to until the first send, at which
  // point router.refresh() re-renders this component with the real id and
  // the hook picks up the new topic. Broadcast, not postgres_changes -- see
  // docs/superpowers/specs/2026-08-22-realtime-broadcast-migration-design.md
  // for why postgres_changes never delivers on this project.
  useBroadcastChannel<BroadcastMessageRow>(
    conversationId ? `mentor_messages:${conversationId}` : null,
    {
      INSERT: (row) => {
        setMessages((prev) =>
          upsertMessage(prev, {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            body: row.body,
            createdAt: row.created_at,
          }),
        );
      },
      // Covers both "delete for everyone" (one row) and "clear chat" (one
      // event per row) -- the other participant's open thread updates live
      // either way, no special-casing needed here.
      DELETE: (row) => {
        removedIdsRef.current.add(row.id);
        setMessages((prev) => prev.filter((m) => m.id !== row.id));
      },
    },
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const { run: send, pending: sending } = useAsyncAction(async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error("Could not send that message.");
        return;
      }
      const data = (await res.json().catch(() => null)) as { message: MessageRow } | null;
      if (!data?.message) {
        // Response was ok but malformed -- fall back to a server refresh
        // rather than silently no-oping; the reconciliation effect above
        // will pick up the message once the server has it.
        setDraft("");
        startTransition(() => router.refresh());
        return;
      }
      // Appended directly from the response, not left to the realtime
      // subscription -- a brand-new thread has no open subscription yet at
      // send time (conversationId was null), and the subscription this
      // triggers via router.refresh() below only catches inserts that
      // happen AFTER it opens, never backfilling the one just sent. The
      // shared upsertMessage guard means this is also safe if realtime
      // *does* independently deliver the same row (an existing thread,
      // subscription already open).
      setMessages((prev) => upsertMessage(prev, data.message));
      setDraft("");
      // Picks up the real conversationId when this was the first message in
      // a brand-new thread, which opens the realtime subscription for any
      // later messages in this thread.
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not send that message.");
    }
  });

  // Covers the send lock plus the clear-chat / refresh transitions, as the
  // single transition flag did before.
  const isPending = sending || isTransitioning;

  function messageAction(body: Record<string, unknown>) {
    return fetch(sendUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function hideForMe(messageId: string) {
    // Optimistic: this only ever affects the local viewer's own state, so
    // there's nothing to reconcile against a broadcast from the other side.
    removedIdsRef.current.add(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    messageAction({ action: "hide", messageId }).then((res) => {
      if (!res.ok) toast.error("Could not delete that message.");
    });
  }

  function deleteForEveryone(messageId: string) {
    if (!window.confirm("Delete this message for everyone? This cannot be undone.")) return;
    removedIdsRef.current.add(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    messageAction({ action: "delete", messageId }).then((res) => {
      if (!res.ok) toast.error("Could not delete that message.");
    });
  }

  function clearChat() {
    if (!window.confirm("Clear this entire conversation for both of you? This cannot be undone.")) return;
    for (const m of messages) removedIdsRef.current.add(m.id);
    startTransition(async () => {
      const res = await messageAction({ action: "clear" });
      if (!res.ok) {
        toast.error("Could not clear this conversation.");
        return;
      }
      setMessages([]);
    });
  }

  return (
    <div className="md:flex md:flex-col md:h-[70vh] md:bg-pz-surface-container-lowest md:rounded-2xl md:border md:border-pz-outline-variant/40 md:overflow-hidden">
      <div className="flex flex-col h-[60vh] md:h-auto md:flex-1 md:min-h-0 max-md:rounded-2xl max-md:border max-md:border-pz-outline-variant/40 max-md:bg-pz-surface-container-lowest max-md:overflow-hidden">
      <div className="px-5 py-4 border-b border-pz-outline-variant/40 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="w-8 h-8">
            <AvatarImage src={counterpartAvatarUrl ?? undefined} alt={counterpartName} />
            <AvatarFallback className="text-xs">{initials(counterpartName)}</AvatarFallback>
          </Avatar>
          <p className="font-headline font-bold text-pz-on-surface truncate">{counterpartName}</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            disabled={isPending}
            aria-label="Clear chat"
            title="Clear chat"
            className="shrink-0 inline-flex items-center justify-center p-2 max-md:min-h-11 max-md:min-w-11 rounded-full text-pz-on-surface-variant/60 hover:text-pz-danger hover:bg-pz-surface-container-high transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant text-center mt-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m, index) => {
            const mine = m.senderId === currentUserId;
            const { isFirst, isLast } = clusterPosition(messages, index);
            const corners = bubbleCorners(mine ? "r" : "l", isFirst, isLast);
            const bubble = (
              <div
                className={
                  mine
                    ? `max-w-[75%] ${corners} bg-pz-primary text-pz-on-primary px-4 py-2`
                    : `max-w-[75%] ${corners} bg-pz-surface-container px-4 py-2 text-pz-on-surface`
                }
              >
                <p className="font-body text-sm whitespace-pre-wrap break-words">{m.body}</p>
                {isLast && (
                  <p
                    className={
                      mine
                        ? "font-label text-[10px] mt-1 text-pz-on-primary/70"
                        : "font-label text-[10px] mt-1 text-pz-on-surface-variant"
                    }
                  >
                    {formatTime(m.createdAt)}
                  </p>
                )}
              </div>
            );

            const menu = (
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Message actions"
                  className="shrink-0 self-end mb-1 inline-flex items-center justify-center p-1 max-md:min-h-11 max-md:min-w-11 rounded-full text-pz-on-surface-variant/50 max-md:opacity-100 md:opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-pz-on-surface hover:bg-pz-surface-container-high transition-all"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? "end" : "start"}>
                  <DropdownMenuItem onSelect={() => hideForMe(m.id)}>Delete for me</DropdownMenuItem>
                  {mine && (
                    <DropdownMenuItem onSelect={() => deleteForEveryone(m.id)} className="text-pz-danger">
                      Delete for everyone
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            );

            return (
              <div key={m.id} className={isFirst ? "mt-3 first:mt-0" : "mt-1"}>
                {mine ? (
                  <div className="flex justify-end items-end gap-1 group">
                    {menu}
                    {bubble}
                  </div>
                ) : (
                  <div className="flex justify-start items-end gap-2 group">
                    {isLast ? (
                      <Avatar className="w-6 h-6 shrink-0">
                        <AvatarImage src={counterpartAvatarUrl ?? undefined} alt={counterpartName} />
                        <AvatarFallback className="text-[10px]">{initials(counterpartName)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-6 h-6 shrink-0" aria-hidden />
                    )}
                    {bubble}
                    {menu}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      </div>

      <div className="md:px-5 md:py-4 md:border-t md:border-pz-outline-variant/40 max-md:sticky max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:z-40 max-md:-mx-4 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
        {canMessage ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Type a message…"
              disabled={isPending}
              className="flex-1 rounded-full border border-pz-outline-variant/50 px-4 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/40 disabled:opacity-50"
            />
            <Button
              type="button"
              variant="bare"
              size="bare"
              aria-label="Send message"
              loading={sending}
              onClick={() => send()}
              disabled={isPending || draft.trim().length === 0}
              className="shrink-0 w-10 h-10 max-md:min-h-11 max-md:min-w-11 rounded-full bg-pz-primary text-pz-on-primary"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <p className="font-body text-sm text-pz-on-surface-variant text-center">
            You need a booking with this mentor before you can message them.
          </p>
        )}
      </div>
    </div>
  );
}
