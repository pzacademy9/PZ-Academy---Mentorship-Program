"use client";

import { useEffect } from "react";
import { captureAttribution } from "./attribution";
import { sendFunnelEvent } from "./funnel";
import { safeLocal, safeSession } from "./storage";

const viewed = new Set<string>(); // React strict mode runs effects twice in dev; count one view per page load

export function AttributionCapture({ slug }: { slug: string }) {
  useEffect(() => {
    captureAttribution(window.location.search, Date.now(), safeLocal(), safeSession());
    if (viewed.has(slug)) return;
    viewed.add(slug);
    sendFunnelEvent(slug, "view");
  }, [slug]);
  return null;
}
