"use client";

import { useState } from "react";
import { ChevronDown, ThumbsUp, ThumbsDown } from "lucide-react";
import type { FaqItem } from "@/lib/crm/sales-help-copy";

export function HelpFaq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  const [voted, setVoted] = useState(false);
  return (
    <section className="bg-pz-surface-container-lowest rounded-xl p-4 sm:p-6 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-headline font-bold text-xl text-pz-on-surface">Questions people ask</h2>
        <span className="text-xs text-pz-on-surface-variant">{items.length} answers</span>
      </div>
      {items.map((f) => {
        const isOpen = open === f.id;
        return (
          <div key={f.id} className="rounded-lg bg-pz-surface-container-low">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-${f.id}`}
              onClick={() => setOpen(isOpen ? null : f.id)}
              className="w-full min-h-14 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-left font-headline font-bold text-sm sm:text-base text-pz-on-surface"
            >
              {f.question}
              <ChevronDown className={`w-5 h-5 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <div id={`faq-${f.id}`} hidden={!isOpen} className="px-4 sm:px-6 pb-4 flex flex-col gap-2 text-sm sm:text-base text-pz-on-surface-variant leading-relaxed">
              {f.answer.map((p) => <p key={p}>{p}</p>)}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 pt-2 text-sm">
        <span className="text-pz-on-surface-variant">Did this answer your question?</span>
        {voted ? (
          <span role="status" className="font-semibold text-pz-primary">Thanks!</span>
        ) : (
          <span className="flex gap-2">
            <button type="button" onClick={() => setVoted(true)} className="min-h-11 min-w-11 px-3 rounded-lg bg-pz-surface-container-low text-pz-on-surface inline-flex items-center justify-center gap-1"><ThumbsUp className="w-4 h-4" aria-hidden="true" />Yes</button>
            <button type="button" onClick={() => setVoted(true)} className="min-h-11 min-w-11 px-3 rounded-lg bg-pz-surface-container-low text-pz-on-surface inline-flex items-center justify-center gap-1"><ThumbsDown className="w-4 h-4" aria-hidden="true" />No</button>
          </span>
        )}
      </div>
    </section>
  );
}
