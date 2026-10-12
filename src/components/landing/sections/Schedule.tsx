// src/components/landing/sections/Schedule.tsx
import { SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function Schedule({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ when: str(i, "when"), title: str(i, "title"), detail: str(i, "detail") })).filter((i) => i.when || i.title);
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-4xl">
        <SectionHeader heading={str(data, "heading")} />
        <ol className="space-y-3 md:space-y-4">
          {items.map((it, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-landing border border-landing-border bg-landing-surface-container-lowest p-4 transition-colors hover:border-landing-primary/40 md:flex-row md:items-center md:gap-6 md:p-6">
              {it.when ? (
                <div className="shrink-0 md:w-1/3">
                  <span className="inline-block rounded-landing bg-landing-mint-light px-2.5 py-1 font-headline text-xs font-bold text-landing-primary md:text-sm">{it.when}</span>
                </div>
              ) : null}
              <div className="min-w-0 md:flex-1 md:border-l md:border-landing-border md:pl-6">
                {it.title ? <h3 className="font-headline text-sm font-bold text-landing-deep md:text-base">{it.title}</h3> : null}
                {it.detail ? <p className="mt-1 text-xs leading-relaxed text-landing-muted md:text-sm">{it.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
