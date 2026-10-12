// src/components/landing/sections/Stats.tsx
import { rows, str } from "./util";
import type { SectionProps } from "./types";

export function Stats({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ value: str(i, "value"), label: str(i, "label") })).filter((i) => i.value || i.label);
  if (items.length === 0) return null;
  return (
    <div className="bg-landing-deep px-4 py-8 text-landing-on-primary md:px-6 md:py-12">
      <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-4 md:gap-0 md:divide-x md:divide-landing-on-primary/10">
        {items.map((it, i) => (
          <div
            key={i}
            className="basis-[calc(50%-0.5rem)] rounded-landing border border-landing-on-primary/10 bg-landing-on-primary/5 p-4 text-center md:min-w-[12rem] md:flex-1 md:basis-0 md:border-0 md:bg-transparent md:px-4"
          >
            <p className="font-headline text-2xl font-extrabold tracking-tight text-landing-mint lg:text-5xl md:text-4xl">{it.value}</p>
            <p className="mt-1 text-xs font-medium text-landing-on-primary/75 md:text-sm">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
