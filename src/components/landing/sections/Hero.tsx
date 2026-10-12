// src/components/landing/sections/Hero.tsx
import { isSafeUrl } from "@/lib/landing/simple-text";
import { LandingImage } from "../LandingImage";
import { RegisterButton, ctaLabel } from "../RegisterButton";
import { rows, str } from "./util";
import type { SectionProps } from "./types";

export function Hero({ data, register }: SectionProps) {
  const eyebrow = str(data, "eyebrow");
  const headline = str(data, "headline");
  const sub = str(data, "subheadline");
  const image = str(data, "image");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const secondaryUrl = str(data, "secondaryCtaUrl");
  const badges = rows(data, "badges").map((b) => str(b, "text")).filter(Boolean);
  const showSecondary = secondaryLabel !== "" && secondaryUrl !== "" && isSafeUrl(secondaryUrl);

  return (
    <div className="border-b border-landing-border bg-gradient-to-b from-landing-surface-container-lowest to-landing-surface lg:from-landing-surface lg:to-landing-surface">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-6 md:px-6 lg:py-16">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-16">
          <div className={`flex flex-col items-start ${image ? "lg:col-span-7" : "lg:col-span-12"}`}>
            {eyebrow ? (
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-landing-mint/40 bg-landing-mint-light px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-landing-deep md:mb-6 md:rounded-landing md:px-3 md:py-1.5 md:text-xs">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-landing-primary" />
                {eyebrow}
              </div>
            ) : null}
            {headline ? (
              <h1 className="mb-3 font-headline text-2xl font-extrabold leading-tight tracking-tight text-landing-deep sm:text-4xl md:mb-6 lg:text-[52px] lg:leading-[1.15]">
                {headline}
              </h1>
            ) : null}
            {sub ? <p className="mb-4 max-w-2xl text-base leading-relaxed text-landing-on-surface md:mb-6 lg:text-lg">{sub}</p> : null}
            {dateLine ? (
              <div className="mb-5 flex items-center gap-2 rounded-landing border border-landing-border bg-landing-surface-container-lowest px-3 py-3 text-sm font-medium text-landing-deep md:mb-8 md:px-4 md:font-semibold">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-landing-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                <span>{dateLine}</span>
              </div>
            ) : null}
            <div className="mb-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-8">
              <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), "Register now")} size="lg" arrow className="w-full sm:w-auto" />
              {showSecondary ? (
                <a
                  href={secondaryUrl}
                  {...(/^https?:\/\//i.test(secondaryUrl) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="inline-flex w-full items-center justify-center rounded-landing border-2 border-landing-primary px-7 py-3.5 text-center font-headline text-base font-bold text-landing-primary transition hover:bg-landing-primary/5 sm:w-auto md:py-4"
                >
                  {secondaryLabel}
                </a>
              ) : null}
            </div>
            {badges.length > 0 ? (
              <ul className="grid w-full grid-cols-1 gap-2 border-t border-landing-border pt-5 sm:grid-cols-3 sm:gap-4">
                {badges.map((b, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-xs font-medium text-landing-deep md:text-landing-on-surface">
                    <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-landing-mint/30 text-xs font-bold text-landing-primary">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {image ? (
            <div className="aspect-[3/2] overflow-hidden rounded-landing lg:col-span-5">
              <LandingImage
                src={image}
                alt={headline}
                width={1200}
                height={800}
                priority
                className="h-full w-full rounded-landing border border-landing-border object-cover shadow-landing-soft-lg lg:border-4 lg:border-landing-surface-container-lowest"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
