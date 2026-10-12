// src/components/landing/sections/Instructors.tsx
import { LandingImage } from "../LandingImage";
import { SimpleText } from "../SimpleText";
import { SectionHeader, rows, str } from "./util";
import type { SectionProps } from "./types";

export function Instructors({ data }: SectionProps) {
  const items = rows(data, "items").map((i) => ({ name: str(i, "name"), role: str(i, "role"), bio: str(i, "bio"), photo: str(i, "photo") })).filter((i) => i.name || i.bio);
  if (items.length === 0) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <SectionHeader heading={str(data, "heading")} />
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
          {items.map((it, i) => (
            <div key={i} className="flex flex-col items-center gap-5 rounded-landing border border-landing-border bg-landing-surface-container-lowest p-5 text-center shadow-landing-soft sm:flex-row sm:items-start sm:gap-6 sm:text-left md:p-8">
              {it.photo ? (
                <LandingImage
                  src={it.photo}
                  alt={it.name}
                  width={112}
                  height={112}
                  className="h-28 w-28 shrink-0 rounded-full border-4 border-landing-mint/30 object-cover shadow-landing-soft"
                />
              ) : null}
              <div className="min-w-0">
                {it.name ? <h3 className="font-headline text-lg font-bold text-landing-deep md:text-xl">{it.name}</h3> : null}
                {it.role ? <p className="mb-3 mt-1 text-xs font-semibold text-landing-primary">{it.role}</p> : null}
                <SimpleText text={it.bio} className="text-sm leading-relaxed text-landing-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
