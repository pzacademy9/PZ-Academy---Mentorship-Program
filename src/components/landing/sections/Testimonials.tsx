// src/components/landing/sections/Testimonials.tsx
import { LandingImage } from "../LandingImage";
import { SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function Testimonials({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ quote: str(i, "quote"), name: str(i, "name"), role: str(i, "role"), photo: str(i, "photo") })).filter((i) => i.quote);
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeader heading={str(data, "heading")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
          {items.map((it, i) => (
            <figure key={i} className="flex flex-col justify-between rounded-landing border border-landing-border bg-landing-surface-container-lowest p-5 shadow-landing-soft md:p-8">
              <blockquote className="mb-6 text-sm italic leading-relaxed text-landing-on-surface">“{it.quote}”</blockquote>
              <figcaption className="flex items-center gap-3 border-t border-landing-border pt-4">
                {it.photo ? <LandingImage src={it.photo} alt={it.name} width={48} height={48} className="h-12 w-12 shrink-0 rounded-full object-cover" /> : null}
                <span className="min-w-0">
                  {it.name ? <span className="block font-headline text-sm font-bold text-landing-deep">{it.name}</span> : null}
                  {it.role ? <span className="block text-xs text-landing-muted">{it.role}</span> : null}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
