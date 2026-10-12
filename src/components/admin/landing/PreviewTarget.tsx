"use client";

import { useEffect, useState } from "react";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { normalizeContent, type LandingContent, type PageKind, type PageStatus } from "@/lib/landing/content";

/**
 * The page inside the editor's preview iframe. It renders the draft it was loaded with, then swaps
 * in whatever the editor posts. Only same-origin messages of the exact expected shape are trusted,
 * and the payload is re-normalized so a bad message can never crash the preview.
 */
export function PreviewTarget({
  initialContent, status, kind, title,
}: { initialContent: LandingContent; status: PageStatus; kind: PageKind; title: string }) {
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: unknown; content?: unknown } | null;
      if (!data || typeof data !== "object" || data.type !== "landing-preview") return;
      setContent(normalizeContent(data.content));
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <LandingRenderer content={content} status={status} kind={kind} pageTitle={title} />;
}
