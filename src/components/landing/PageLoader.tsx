// src/components/landing/PageLoader.tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SITE_LOGO_ALT, SITE_LOGO_URL } from "@/lib/site-logo";

const MIN_MS = 600;
const MAX_MS = 3000;

/**
 * A full-screen loading screen shown while the hero picture arrives. It is part of the server HTML, so it
 * is there from the first paint. It leaves when the hero picture is ready (never before a short minimum,
 * so a cached picture does not cause a flash) and always within 3 seconds. A pure-CSS animation also
 * hides it after 3 seconds, so it can never trap a visitor if the page script fails to run.
 */
export function PageLoader({ heroId }: { heroId: string }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timers: number[] = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.push(window.setTimeout(() => setGone(true), Math.max(0, MIN_MS - (Date.now() - started))));
    };
    const img = document.getElementById(heroId)?.querySelector("img") ?? null;
    if (!img || img.complete) {
      finish();
    } else {
      img.addEventListener("load", finish, { once: true });
      img.addEventListener("error", finish, { once: true });
    }
    timers.push(window.setTimeout(() => setGone(true), MAX_MS));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      img?.removeEventListener("load", finish);
      img?.removeEventListener("error", finish);
    };
  }, [heroId]);

  if (gone) return null;
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-landing-deep"
      style={{ animation: "pz-loader-out 0.4s ease 3s forwards" }}
    >
      <style>{"@keyframes pz-loader-out{to{opacity:0;visibility:hidden}}@keyframes pz-loader-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.pz-loader-spinner{animation-duration:3s!important}}"}</style>
      <span className="flex items-center rounded-landing bg-white px-3 py-2">
        <Image src={SITE_LOGO_URL} alt={SITE_LOGO_ALT} width={40} height={40} className="h-10 w-auto" priority unoptimized />
      </span>
      <span
        aria-hidden="true"
        className="pz-loader-spinner h-9 w-9 rounded-full border-4 border-white/25 border-t-landing-mint"
        style={{ animation: "pz-loader-spin 0.9s linear infinite" }}
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}
