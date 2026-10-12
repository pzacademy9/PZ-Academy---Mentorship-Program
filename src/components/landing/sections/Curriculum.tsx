// src/components/landing/sections/Curriculum.tsx
import { CheckList, SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function Curriculum({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ title: str(i, "title"), subtitle: str(i, "subtitle"), points: str(i, "points") })).filter((i) => i.title || i.points);
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface-container-lowest px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-4xl">
        <SectionHeader heading={str(data, "heading")} />
        <div className="space-y-3 md:space-y-4">
          {items.map((it, i) => (
            <details
              key={i}
              open={i === 0}
              className="group overflow-hidden rounded-landing border border-landing-border bg-landing-surface-container-lowest transition-colors hover:border-landing-primary/50 open:border-2 open:border-landing-primary open:shadow-landing-soft"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 md:p-6 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-3 md:gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-landing border border-landing-border bg-landing-surface font-headline text-sm font-bold text-landing-on-surface group-open:border-landing-primary group-open:bg-landing-primary group-open:text-landing-on-primary md:h-10 md:w-10">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-headline text-base font-bold text-landing-deep md:text-lg">{it.title}</span>
                    {it.subtitle ? <span className="mt-0.5 block text-xs font-medium text-landing-muted group-open:text-landing-primary">{it.subtitle}</span> : null}
                  </span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0 fill-none stroke-landing-muted transition-transform group-open:rotate-180 group-open:stroke-landing-primary" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              {it.points ? (
                <div className="border-t border-landing-border px-4 pb-5 pt-4 text-sm text-landing-on-surface md:px-6 md:pb-6">
                  <CheckList text={it.points} />
                </div>
              ) : null}
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
