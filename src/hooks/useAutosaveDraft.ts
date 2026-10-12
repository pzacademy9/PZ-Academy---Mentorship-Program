"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingContent } from "@/lib/landing/content";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

/**
 * Debounced, strictly serial autosave with optimistic concurrency.
 *  - one request in flight at a time (so a slow older response can never
 *    arrive after, and overwrite, a newer save);
 *  - each request carries the revision returned by the previous one;
 *  - 409 = someone else saved: stop, surface "conflict", never retry;
 *  - network/5xx = keep the content and surface "error"; saveNow() retries.
 */
export function useAutosaveDraft({ pageId, initialRevision, delayMs = 800, onRevision }: { pageId: string; initialRevision: number; delayMs?: number; onRevision?: (revision: number) => void }) {
  const onRevisionRef = useRef(onRevision);
  onRevisionRef.current = onRevision;
  const [state, setState] = useState<SaveState>("saved");
  const revision = useRef(initialRevision);
  const pending = useRef<LandingContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const conflicted = useRef(false);

  const run = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    if (conflicted.current) return Promise.resolve(false);
    if (!pending.current) return Promise.resolve(true);

    const p = (async () => {
      let allOk = true;
      while (pending.current && !conflicted.current) {
        const content = pending.current;
        pending.current = null;
        setState("saving");
        try {
          const res = await fetch(`/api/admin/landing-pages/${pageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, baseRevision: revision.current }),
          });
          if (res.status === 409) {
            conflicted.current = true;
            setState("conflict");
            allOk = false;
            break;
          }
          if (!res.ok) throw new Error(String(res.status));
          const json = (await res.json()) as { revision: number };
          revision.current = json.revision;
          onRevisionRef.current?.(json.revision);
        } catch {
          pending.current = pending.current ?? content;
          setState("error");
          allOk = false;
          break;
        }
      }
      if (allOk) setState(pending.current ? "dirty" : "saved");
      return allOk;
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
    return p;
  }, [pageId]);

  const schedule = useCallback(
    (content: LandingContent) => {
      if (conflicted.current) return;
      pending.current = content;
      setState((s) => (s === "saving" ? s : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), delayMs);
    },
    [run, delayMs],
  );

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    return run();
  }, [run]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { state, schedule, saveNow };
}
