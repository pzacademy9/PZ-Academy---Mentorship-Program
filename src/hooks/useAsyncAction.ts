"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Wraps an async action so it cannot run twice at once.
 * The lock is a ref, so two clicks in the same tick (before React re-renders
 * a disabled button) still call `fn` only once. The lock and `pending` always
 * release in `finally`; errors are rethrown to the caller.
 */
export function useAsyncAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: { getKey?: (...args: A) => string } = {},
) {
  const lock = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const getKeyRef = useRef(options.getKey);
  getKeyRef.current = options.getKey;

  const [pending, setPending] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    setPendingKey(getKeyRef.current ? getKeyRef.current(...args) : null);
    try {
      return await fnRef.current(...args);
    } finally {
      lock.current = false;
      setPending(false);
      setPendingKey(null);
    }
  }, []);

  return { run, pending, pendingKey };
}
