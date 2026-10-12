"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LandingContent } from "@/lib/landing/content";

const DEVICES = {
  laptop: { label: "Laptop", width: 1280, icon: Laptop },
  phone: { label: "Phone", width: 390, icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

/**
 * The live preview: the real landing page in an iframe (the admin-only preview route) rendered at a
 * laptop or phone logical width and scaled down to fit the pane. Every content change is posted to
 * the iframe, same-origin only; it is also re-posted when the frame (re)loads, because the frame loads
 * the last SAVED draft and the editor may hold newer unsaved edits.
 */
export function PreviewFrame({ content, pageId }: { content: LandingContent; pageId: string }) {
  const [device, setDevice] = useState<Device>("laptop");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const [box, setBox] = useState({ w: 0, h: 0 });

  const post = useCallback(() => {
    try {
      frameRef.current?.contentWindow?.postMessage({ type: "landing-preview", content: contentRef.current }, window.location.origin);
    } catch {
      /* the frame is not ready yet; its load event posts again */
    }
  }, []);

  useEffect(() => { post(); }, [content, post]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = DEVICES[device].width;
  const scale = box.w > 0 ? Math.min(1, box.w / width) : 1;
  const height = box.h > 0 ? box.h / scale : 800;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-headline text-xs font-bold uppercase tracking-wider text-pz-on-surface-variant">Device preview</span>
          <div className="inline-flex rounded-lg bg-pz-surface-container-high p-0.5">
            {(Object.keys(DEVICES) as Device[]).map((d) => {
              const { label, icon: Icon } = DEVICES[d];
              const on = d === device;
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-body text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11",
                    on ? "bg-pz-surface-container-lowest font-bold text-pz-on-surface shadow-sm" : "font-medium text-pz-on-surface-variant",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label} ({DEVICES[d].width}px)
                </button>
              );
            })}
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant">
          <span className="h-2 w-2 rounded-full bg-pz-success" aria-hidden="true" />
          Live preview
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-pz-outline-variant bg-pz-surface-container">
        <div className="mx-auto h-full overflow-hidden" style={{ width: width * scale }}>
          <iframe
            ref={frameRef}
            title="Page preview"
            src={`/dashboard/admin/landing-pages/${pageId}/preview`}
            onLoad={post}
            className="block border-0 bg-white"
            style={{ width: `${width}px`, height: `${height}px`, transform: `scale(${scale})`, transformOrigin: "top left" }}
          />
        </div>
      </div>
    </div>
  );
}
