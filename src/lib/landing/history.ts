// src/lib/landing/history.ts
// Pure undo/redo history. No React, no clock: the caller passes the time in.
export interface History<T> { past: T[]; future: T[]; lastAt: number }

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [], lastAt: 0 });

export function record<T>(
  h: History<T>,
  before: T,
  now: number,
  opts: { coalesceMs?: number; limit?: number } = {},
): History<T> {
  const coalesceMs = opts.coalesceMs ?? 1000;
  const limit = opts.limit ?? 100;
  if (h.past.length > 0 && now - h.lastAt < coalesceMs) return { ...h, future: [], lastAt: now };
  return { past: [...h.past, before].slice(-limit), future: [], lastAt: now };
}

export function undo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.past.length === 0) return null;
  const value = h.past[h.past.length - 1];
  return { history: { past: h.past.slice(0, -1), future: [...h.future, current], lastAt: 0 }, value };
}

export function redo<T>(h: History<T>, current: T): { history: History<T>; value: T } | null {
  if (h.future.length === 0) return null;
  const value = h.future[h.future.length - 1];
  return { history: { past: [...h.past, current], future: h.future.slice(0, -1), lastAt: 0 }, value };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
