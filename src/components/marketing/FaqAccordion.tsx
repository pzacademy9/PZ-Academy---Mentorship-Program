"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FaqItem {
  q: string;
  a: string;
}

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div
          key={i}
          className={cn(
            "bg-white rounded-2xl border-[1.5px] overflow-hidden transition-all duration-250",
            open === i ? "border-pz-bright shadow-[0_4px_20px_rgba(126,217,87,.1)]" : "border-pz-border hover:border-pz-mid"
          )}
        >
          <button
            className="w-full flex items-center justify-between px-6 py-5 text-left font-semibold text-[.94rem] text-pz-deep font-poppins gap-4 transition-colors duration-200 hover:text-pz-forest"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
          >
            <span>{item.q}</span>
            <span className={cn(
              "w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center transition-all duration-300",
              open === i ? "bg-pz-bright rotate-180" : "bg-pz-offwhite"
            )}>
              <ChevronDown className={cn("w-[13px] h-[13px] transition-colors duration-200", open === i ? "text-pz-forest" : "text-pz-mid")} />
            </span>
          </button>
          <div className={cn(
            "overflow-hidden transition-all duration-[380ms] ease-[cubic-bezier(.23,1,.32,1)]",
            open === i ? "max-h-[300px]" : "max-h-0"
          )}>
            <p
              className="px-6 pb-5 text-[.88rem] text-pz-muted leading-[1.78] font-poppins"
              dangerouslySetInnerHTML={{ __html: item.a }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
