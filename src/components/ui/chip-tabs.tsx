"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Tab/chip row: one horizontally scrollable line on phones (active chip
 * scrolled into view, fade on the side that has more), wraps at md and up.
 */
export function ChipTabs({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [fadeRight, setFadeRight] = useState(false);
  const [fadeLeft, setFadeLeft] = useState(false);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const active = row.querySelector<HTMLElement>("[aria-current=page]");
    active?.scrollIntoView?.({ block: "nearest", inline: "center" });
    const update = () => {
      setFadeLeft(row.scrollLeft > 4);
      setFadeRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    };
    update();
    row.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      row.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [children]);

  return (
    <nav aria-label={label} className={cn("relative -mx-4 md:mx-0", className)}>
      <div
        ref={rowRef}
        data-chip-row
        className="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-md:flex-nowrap md:flex-wrap md:overflow-visible md:px-0 [&>*]:shrink-0 [&>*]:snap-start max-md:[&>*]:min-h-11 [&>*]:inline-flex [&>*]:items-center"
      >
        {children}
      </div>
      {fadeLeft && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent md:hidden" />}
      {fadeRight && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />}
    </nav>
  );
}
