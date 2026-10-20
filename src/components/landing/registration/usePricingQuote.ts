"use client";

import { useEffect, useMemo, useState } from "react";
import { computeQuote, type QuoteResult } from "@/lib/landing/registration/pricing";
import type { Mode, RegistrationView } from "@/lib/landing/registration/config";
import type { PromoResult } from "@/lib/landing/registration/promo";
import { variantQuery } from "./variant";
import type { QuoteResponse } from "./types";

export interface Selection { regionKey: string; mode: Mode; optionKeys: string[]; tierKey: string; groupSize: number }
export interface PricingQuote { quote: QuoteResult | null; promo: PromoResult | null; source: "local" | "server"; pending: boolean }

/**
 * Instant price from the same pure engine the server uses, then the server's answer (which wins: it
 * owns the clock for Early Bird and validates promo codes). Only the newest selection's answer is shown.
 */
export function usePricingQuote({
  slug, config, selection, promoCode, email, debounceMs = 300, variant,
}: { slug: string; config: RegistrationView; selection: Selection; promoCode: string; email: string; debounceMs?: number; variant?: string }): PricingQuote {
  const code = promoCode.trim();
  const key = JSON.stringify([selection.regionKey, selection.mode, [...selection.optionKeys].sort(), selection.tierKey, selection.groupSize, code, code ? email.trim().toLowerCase() : ""]);
  const hasChoice = selection.optionKeys.length > 0;

  const local = useMemo<QuoteResult | null>(
    () => (hasChoice ? computeQuote({ config, ...selection, now: new Date() }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, key],
  );

  const [server, setServer] = useState<{ key: string; quote: QuoteResult; promo: PromoResult | null } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!hasChoice) { setPending(false); return; }
    const ctrl = new AbortController();
    setPending(true);
    const timer = setTimeout(async () => {
      try {
        const body: Record<string, unknown> = { ...selection };
        if (code) { body.promoCode = code; if (email.trim()) body.email = email.trim().toLowerCase(); }
        const res = await fetch(`/api/landing/${encodeURIComponent(slug)}/quote${variantQuery(variant)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as QuoteResponse;
        if (!ctrl.signal.aborted) setServer({ key, quote: data.quote, promo: data.promo ?? null });
      } catch {
        // Offline or aborted: the local price stays on screen; the server re-checks at submit anyway.
      } finally {
        if (!ctrl.signal.aborted) setPending(false);
      }
    }, debounceMs);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, slug, variant, debounceMs]);

  if (server && server.key === key) return { quote: server.quote, promo: server.promo, source: "server", pending };
  return { quote: local, promo: null, source: "local", pending };
}
