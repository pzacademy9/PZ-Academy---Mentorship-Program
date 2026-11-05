"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  q: string;
  a: string;
}

/**
 * White question cards that open one at a time (Stitch FAQ accordion).
 * Default: `a` is our own fixed copy with simple HTML. Pass `plainText` for
 * admin-typed answers: they are shown as text, never as markup.
 */
export function FaqAccordion({ items, plainText = false, onCard = false }: { items: FaqItem[]; plainText?: boolean; /** Mint items, for use inside a white card. */ onCard?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${base}-faq-${i}`;
        return (
          <div key={i} className={cn("rounded-2xl px-5", onCard ? "bg-pz-web-surface-low" : "bg-pz-surface-container-lowest shadow-sm")}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-4 py-5 text-left font-montserrat text-lg font-bold text-pz-deep md:text-xl"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="min-w-0 break-words">{item.q}</span>
              <ChevronDown aria-hidden="true" className={cn("h-6 w-6 shrink-0 text-pz-deep transition-transform duration-200", isOpen && "rotate-180")} />
            </button>
            <div id={panelId} hidden={!isOpen} className="border-t border-pz-border pb-5 pt-3">
              {plainText ? (
                <p className="whitespace-pre-line break-words font-poppins text-[15px] leading-relaxed text-pz-muted">{item.a}</p>
              ) : (
                <p className="font-poppins text-[15px] leading-relaxed text-pz-muted" dangerouslySetInnerHTML={{ __html: item.a }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
