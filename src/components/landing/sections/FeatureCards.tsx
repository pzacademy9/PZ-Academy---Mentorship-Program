// src/components/landing/sections/FeatureCards.tsx
import { CheckIcon, SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function FeatureCards({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ title: str(i, "title"), text: str(i, "text") })).filter((i) => i.title || i.text);
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeader heading={str(data, "heading")} sub={str(data, "subheading")} className="max-w-3xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
          {items.map((it, i) => (
            <div key={i} className="rounded-landing border border-landing-border bg-landing-surface-container-lowest p-5 shadow-landing-soft transition hover:-translate-y-1 hover:shadow-landing-soft-lg md:p-8">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-landing bg-landing-mint-light md:mb-6 md:h-12 md:w-12">
                <CheckIcon className="h-6 w-6" />
              </div>
              {it.title ? <h3 className="mb-2 font-headline text-base font-bold text-landing-deep md:text-lg">{it.title}</h3> : null}
              {it.text ? <p className="text-sm leading-relaxed text-landing-muted">{it.text}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
