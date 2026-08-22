"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** Shape of the payload realtime.broadcast_changes() sends -- see migrations 0042/0043. */
type BroadcastChangePayload<R> = {
  record: R;
  old_record: R | null;
  operation: string;
  table: string;
  schema: string;
};

/**
 * Subscribes to a private Realtime Broadcast channel and hands each INSERT's
 * row to `onInsert`. `onInsertRef` exists so callers can pass an inline
 * closure (fresh every render, closing over current state) without the
 * effect re-subscribing -- and therefore churning the channel -- every time
 * that closure's identity changes. If the subscribe status is ever anything
 * other than SUBSCRIBED (drop, network blip, backgrounded tab), triggers a
 * server refresh so a caller with its own reconciliation effect (like
 * MessageThread) can recover -- otherwise a dropped channel looks quiet with
 * no visible error.
 */
export function useBroadcastChannel<R>(
  topic: string | null,
  event: string,
  onInsert: (record: R) => void,
) {
  const router = useRouter();
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  });

  useEffect(() => {
    if (!topic) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(topic, { config: { private: true } })
      .on(
        "broadcast",
        { event },
        (msg: { payload: BroadcastChangePayload<R> }) => {
          if (!msg.payload || !("record" in msg.payload)) {
            console.error(
              `[useBroadcastChannel] malformed broadcast payload on topic "${topic}", event "${event}" -- expected { record: ... }, got:`,
              msg.payload,
            );
            return;
          }
          onInsertRef.current(msg.payload.record);
        },
      )
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") router.refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, event, router]);
}
