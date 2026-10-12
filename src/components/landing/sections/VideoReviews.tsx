// src/components/landing/sections/VideoReviews.tsx
import { youtubeId } from "@/lib/landing/simple-text";
import { YouTubeFacade } from "./YouTubeFacade";
import { SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function VideoReviews({ data }: SectionProps) {
  const items = rows(data, "items").flatMap((i) => {
    const url = str(i, "url");
    const id = youtubeId(url);
    return id ? [{ id, caption: str(i, "caption"), short: /\/shorts\//i.test(url) }] : [];
  });
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface-container-lowest py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="px-4 md:px-0">
          <SectionHeader heading={str(data, "heading")} />
        </div>
        {/* Phone: swipeable row. Tablet and up: grid. */}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-auto md:grid md:max-w-5xl md:grid-cols-2 md:gap-8 md:overflow-visible md:px-0 lg:grid-cols-3">
          {items.map((it, i) => (
            <figure key={i} className={`shrink-0 snap-start md:w-auto ${it.short ? "w-[155px]" : "w-[280px]"}`}>
              <YouTubeFacade id={it.id} short={it.short} title={it.caption || "Student video review"} />
              {it.caption ? <figcaption className="mt-3 text-center text-xs font-semibold text-landing-on-surface">{it.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
