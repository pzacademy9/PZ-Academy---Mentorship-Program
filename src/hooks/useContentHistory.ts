"use client";

import { useCallback, useRef, useState } from "react";
import type { LandingContent } from "@/lib/landing/content";
import { canRedo, canUndo, emptyHistory, record, redo, undo, type History } from "@/lib/landing/history";

/**
 * Undo/redo for the page builder's main draft. The history lives in a ref so undo/redo can return the
 * value in the same tick; a counter in state re-renders the buttons when it changes.
 */
export function useContentHistory() {
  const ref = useRef<History<LandingContent>>(emptyHistory());
  const [, setTick] = useState(0);
  const commit = useCallback((h: History<LandingContent>) => { ref.current = h; setTick((n) => n + 1); }, []);

  const recordBefore = useCallback((before: LandingContent) => {
    commit(record(ref.current, before, Date.now()));
  }, [commit]);
  const undoTo = useCallback((current: LandingContent): LandingContent | null => {
    const r = undo(ref.current, current);
    if (!r) return null;
    commit(r.history);
    return r.value;
  }, [commit]);
  const redoTo = useCallback((current: LandingContent): LandingContent | null => {
    const r = redo(ref.current, current);
    if (!r) return null;
    commit(r.history);
    return r.value;
  }, [commit]);
  const clear = useCallback(() => commit(emptyHistory()), [commit]);

  return {
    record: recordBefore,
    undo: undoTo,
    redo: redoTo,
    clear,
    canUndo: canUndo(ref.current),
    canRedo: canRedo(ref.current),
  };
}

/** Which history action a key press asks for, or null. Typing fields keep the browser's own undo. */
export function historyKeyAction(e: KeyboardEvent): "undo" | "redo" | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const t = e.target;
  if (t instanceof HTMLElement) {
    const tag = t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable || t.getAttribute("contenteditable") === "true") return null;
  }
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y") return "redo";
  return null;
}
