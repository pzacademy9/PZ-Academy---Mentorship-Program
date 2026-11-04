"use client";

import { useEffect, useRef, useState } from "react";

/** Splits "12+" into 12 and "+". Values with no leading number (e.g. "SECP") return null. */
export function splitStat(value: string): { num: number; suffix: string } | null {
  const m = /^(\d+)(.*)$/.exec(value);
  return m ? { num: Number(m[1]), suffix: m[2] } : null;
}

/**
 * Shows a number that counts up once when it first scrolls into view.
 * The server (and anyone with "reduce motion" on) sees the final value.
 */
export function StatCounter({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const parts = splitStat(value);
    const el = ref.current;
    if (!parts || !el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(`${Math.round(parts.num * eased)}${parts.suffix}`);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
