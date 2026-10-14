"use client";

import { useCallback, useEffect, useState } from "react";
import type { MeProfile, PublicConfig } from "./types";

export type RegistrationConfigState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; config: PublicConfig; me: MeProfile | null };

/** Fetches the public config and the logged-in profile in parallel, only while `enabled` (the modal is open). */
export function useRegistrationConfig(slug: string, enabled = true): RegistrationConfigState & { retry: () => void } {
  const [state, setState] = useState<RegistrationConfigState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const key = `${slug}#${attempt}`;
    if (loadedFor === key) return; // reopening the modal does not refetch
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const [cfgRes, me] = await Promise.all([
          fetch(`/api/landing/${encodeURIComponent(slug)}/config`, { cache: "no-store" }),
          fetch("/api/landing/me", { cache: "no-store", credentials: "same-origin" })
            .then(async (r) => (r.ok ? ((await r.json()) as MeProfile | null) : null))
            .catch(() => null),
        ]);
        if (cancelled) return;
        if (cfgRes.status === 404) {
          setState({ status: "error", message: "This registration form isn't available any more." });
          return;
        }
        if (!cfgRes.ok) throw new Error(String(cfgRes.status));
        const config = (await cfgRes.json()) as PublicConfig;
        if (cancelled) return;
        setState({ status: "ready", config, me: me && typeof me.email === "string" && me.email ? me : null });
        setLoadedFor(key);
      } catch {
        if (!cancelled) setState({ status: "error", message: "We couldn't load the registration form. Check your connection and try again." });
      }
    })();
    return () => { cancelled = true; };
  }, [slug, enabled, attempt, loadedFor]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}
