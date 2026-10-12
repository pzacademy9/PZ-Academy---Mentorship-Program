// src/components/landing/sections/Faq.tsx
import { SimpleText } from "../SimpleText";
import { SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function Faq({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ q: str(i, "q"), a: str(i, "a") })).filter((i) => i.q);
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface-container-lowest px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-5xl">
        <SectionHeader heading={str(data, "heading")} />
        {/* Native <details>: works with no JavaScript. */}
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-6">
          {items.map((it, i) => (
            <details key={i} className="group rounded-landing border border-landing-border bg-landing-surface p-4 md:p-6">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-headline text-sm font-bold text-landing-deep md:text-base [&::-webkit-details-marker]:hidden">
                <span>{it.q}</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 fill-none stroke-landing-primary transition-transform group-open:rotate-180" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              <SimpleText text={it.a} className="mt-3 text-sm leading-relaxed text-landing-muted" />
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
