"use client";

import { useEffect } from "react";
import { installPixel, track } from "./pixel";

/** Loads the Meta Pixel only after the page has loaded and the browser is idle, so it never competes with LCP. */
export function PixelLoader({ pixelId, contentName }: { pixelId: string; contentName: string }) {
  useEffect(() => {
    if (!pixelId) return;
    let cancelled = false;
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (cancelled) return;
      if (installPixel(pixelId)) {
        track("PageView");
        track("ViewContent", { content_name: contentName });
      }
    };
    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(start, { timeout: 3000 });
      else timer = setTimeout(start, 1500);
    };
    // "After interactive": as soon as the document has parsed (and then idle), never during parsing.
    if (document.readyState !== "loading") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      if (timer) clearTimeout(timer);
    };
  }, [pixelId, contentName]);
  return null;
}
