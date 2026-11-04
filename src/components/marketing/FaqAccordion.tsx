"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  q: string;
  a: string;
}

/** White question cards that open one at a time (Stitch FAQ accordion). `a` is our own fixed copy, never admin text. */
export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${base}-faq-${i}`;
        return (
          <div key={i} className="rounded-2xl bg-pz-surface-container-lowest px-5 shadow-sm">
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-4 py-5 text-left font-montserrat text-lg font-bold text-pz-deep md:text-xl"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span>{item.q}</span>
              <ChevronDown aria-hidden="true" className={cn("h-6 w-6 shrink-0 text-pz-deep transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            <div id={panelId} hidden={!isOpen} className="border-t border-pz-border pb-5 pt-3">
              <p className="font-poppins text-[15px] leading-relaxed text-pz-muted" dangerouslySetInnerHTML={{ __html: item.a }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
