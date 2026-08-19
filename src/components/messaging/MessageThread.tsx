"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import type { MessageRow } from "@/lib/data/mentor-messaging";

export function MessageThread({
  conversationId,
  initialMessages,
  currentUserId,
  counterpartName,
  canMessage,
  sendUrl,
}: {
  conversationId: string | null;
  initialMessages: MessageRow[];
  currentUserId: string;
  counterpartName: string;
  canMessage: boolean;
  sendUrl: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  // The only client-side Supabase Realtime subscription in this codebase --
  // every other data flow goes through a server route. Only subscribes once
  // a real conversationId exists; a brand-new thread (nobody has sent a
  // message yet) has nothing to subscribe to until the first send, at which
  // point router.refresh() below re-renders this component with the real id.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`mentor_messages:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mentor_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
          };
          setMessages((prev) =>
            prev.some((m) => m.id === row.id)
              ? prev
              : [
                  ...prev,
                  { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at },
                ],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        toast.error("Could not send that message.");
        return;
      }
      const data = (await res.json()) as { message: MessageRow };
      // Appended directly from the response, not left to the realtime
      // subscription -- a brand-new thread has no open subscription yet at
      // send time (conversationId was null), and the subscription this
      // triggers via router.refresh() below only catches inserts that
      // happen AFTER it opens, never backfilling the one just sent. The
      // dedup guard means this is also safe if realtime *does* independently
      // deliver the same row (an existing thread, subscription already open).
      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      setDraft("");
      // Picks up the real conversationId when this was the first message in
      // a brand-new thread, which opens the realtime subscription for any
      // later messages in this thread.
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-[70vh] bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
      <div className="px-5 py-4 border-b border-pz-outline-variant/40">
        <p className="font-headline font-bold text-pz-on-surface">{counterpartName}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <p className="font-body text-sm text-pz-on-surface-variant text-center mt-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    mine
                      ? "max-w-[75%] rounded-2xl rounded-br-sm bg-pz-primary text-pz-on-primary px-4 py-2"
                      : "max-w-[75%] rounded-2xl rounded-bl-sm bg-pz-surface-container px-4 py-2 text-pz-on-surface"
                  }
                >
                  <p className="font-body text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={
                      mine
                        ? "font-label text-[10px] mt-1 text-pz-on-primary/70"
                        : "font-label text-[10px] mt-1 text-pz-on-surface-variant"
                    }
                  >
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-5 py-4 border-t border-pz-outline-variant/40">
        {canMessage ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message…"
              disabled={isPending}
              className="flex-1 rounded-full border border-pz-outline-variant/50 px-4 py-2.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-pz-primary/40 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={isPending || draft.trim().length === 0}
              className="shrink-0 w-10 h-10 rounded-full bg-pz-primary text-pz-on-primary grid place-items-center disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
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
