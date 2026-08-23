"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/client";

/** Shape of the payload realtime.broadcast_changes() sends -- see migrations 0042/0043/0044. */
type BroadcastChangePayload<R> = {
  record: R;
  old_record: R | null;
  operation: string;
  table: string;
  schema: string;
};

/**
 * Subscribes to a private Realtime Broadcast channel and dispatches each
 * event to its matching handler in `handlers` (e.g. `{ INSERT: ..., DELETE:
 * ... }`). `handlersRef` exists so callers can pass inline closures (fresh
 * every render, closing over current state) without the effect
 * re-subscribing -- and therefore churning the channel -- every time a
 * closure's identity changes. The event *set* (handlers' keys) is expected
 * to stay stable for a given caller, since it drives which `.on()` listeners
 * get attached; only the set is a dependency, not the handler functions
 * themselves. Once the channel has reached SUBSCRIBED at least once, a later
 * drop (CHANNEL_ERROR / TIMED_OUT -- network blip, backgrounded tab,
 * transient Realtime outage) triggers a server refresh so a caller with its
 * own reconciliation effect (like MessageThread) can recover -- otherwise a
 * dropped channel looks quiet with no visible error. Statuses before the
 * first SUBSCRIBED (e.g. an RLS denial on first subscribe) and CLOSED from
 * normal unmount teardown do NOT refresh -- neither can be fixed by
 * retrying, and refreshing on every non-SUBSCRIBED status would loop on a
 * genuine outage (the Phoenix client's rejoin timer keeps re-firing
 * CHANNEL_ERROR on backoff) or fire a stray refresh on every navigation away.
 */
export function useBroadcastChannel<R>(
  topic: string | null,
  handlers: Record<string, (record: R) => void>,
) {
  const router = useRouter();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const wasSubscribedRef = useRef(false);
  const events = Object.keys(handlers).sort().join(",");

  useEffect(() => {
    if (!topic || !events) return;
    // Reset fresh for this subscribe attempt -- a resubscribe on a new topic
    // (or a fresh mount) should not inherit "was healthy" from a prior one.
    wasSubscribedRef.current = false;
    const supabase = createBrowserSupabase();
    let channel = supabase.channel(topic, { config: { private: true } });

    for (const event of events.split(",")) {
      channel = channel.on(
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
          handlersRef.current[event]?.(msg.payload.record);
        },
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        wasSubscribedRef.current = true;
        return;
      }
      if (
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
        wasSubscribedRef.current
      ) {
        wasSubscribedRef.current = false;
        router.refresh();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic, events, router]);
}
