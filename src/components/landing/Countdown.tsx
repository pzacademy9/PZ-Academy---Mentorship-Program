// src/components/landing/Countdown.tsx
"use client";

import { useEffect, useState } from "react";

function remaining(to: string, now: number) {
  const t = Date.parse(to);
  if (Number.isNaN(t) || t <= now) return null;
  const mins = Math.floor((t - now) / 60000);
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

/** Renders nothing on the server / before mount, so it can never cause a hydration mismatch. */
export function Countdown({ to, label }: { to: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const r = remaining(to, now);
  if (!r) return null;
  return (
    <div role="status" className="border-b border-landing-on-primary/10 bg-landing-deep px-4 py-2.5 text-center text-xs font-medium text-landing-on-primary md:text-sm">
      {label ? `${label} ` : ""}
      <strong className="font-bold tracking-wide tabular-nums text-landing-mint">{r.d}d {r.h}h {r.m}m</strong>
    </div>
  );
}
