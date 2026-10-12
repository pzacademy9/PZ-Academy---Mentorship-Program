// src/components/landing/Countdown.tsx
"use client";

import { useEffect, useState } from "react";

function remaining(to: string, now: number) {
  const t = Date.parse(to);
  if (Number.isNaN(t) || t <= now) return null;
  const mins = Math.floor((t - now) / 60000);
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

/**
 * Server and first client render are identical: a fixed-height banner with a placeholder, so the page
 * never shifts when the numbers arrive. The numbers appear only after mount; the banner collapses
 * (renders null) only if the date turns out to be past or invalid.
 */
export function Countdown({ to, label }: { to: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const r = now === null ? null : remaining(to, now);
  if (now !== null && !r) return null;
  return (
    <div role="status" className="flex min-h-[2.5rem] items-center justify-center gap-1.5 border-b border-landing-on-primary/10 bg-landing-deep px-4 py-2.5 text-center text-xs font-medium text-landing-on-primary md:text-sm">
      {label ? <span>{label}</span> : null}
      <strong className="font-bold tracking-wide tabular-nums text-landing-mint">{r ? `${r.d}d ${r.h}h ${r.m}m` : <span aria-hidden="true">–d –h –m</span>}</strong>
    </div>
  );
}
