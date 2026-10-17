// src/components/landing/sections/Hero.tsx
import { isSafeUrl } from "@/lib/landing/simple-text";
import { LandingImage } from "../LandingImage";
import { LandingPicture } from "../LandingPicture";
import { RegisterButton, ctaLabel } from "../RegisterButton";
import { rows, str } from "./util";
import type { SectionProps } from "./types";

type Target = { href: string; external: boolean } | null;

// A second button with a missing, unknown or unsafe target is dropped (renders nothing).
function secondaryTarget(data: Record<string, unknown>, sectionIds: string[] | undefined): Target {
  if (str(data, "secondaryCtaLabel") === "") return null;
  const type = str(data, "secondaryCtaType") || "link";
  if (type === "section") {
    const id = str(data, "secondaryCtaSection");
    return id !== "" && (sectionIds ?? []).includes(id) ? { href: `#${id}`, external: false } : null;
  }
  if (type === "whatsapp") {
    const digits = str(data, "secondaryCtaWhatsapp").replace(/\D/g, "");
    return digits !== "" ? { href: `https://wa.me/${digits}`, external: true } : null;
  }
  const url = str(data, "secondaryCtaUrl");
  return url !== "" && isSafeUrl(url) ? { href: url, external: /^https?:\/\//i.test(url) } : null;
}

function SecondaryButton({ target, label, onDark }: { target: NonNullable<Target>; label: string; onDark?: boolean }) {
  const cls = onDark
    ? "inline-flex w-full items-center justify-center rounded-landing border-2 border-white px-7 py-3.5 text-center font-headline text-base font-bold text-white transition hover:bg-white/10 sm:w-auto md:py-4"
    : "inline-flex w-full items-center justify-center rounded-landing border-2 border-landing-primary px-7 py-3.5 text-center font-headline text-base font-bold text-landing-primary transition hover:bg-landing-primary/5 sm:w-auto md:py-4";
  return (
    <a
      href={target.href}
      {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cls}
    >
      {label}
    </a>
  );
}

function DateLine({ text, onDark }: { text: string; onDark?: boolean }) {
  const box = onDark
    ? "mb-5 flex items-center gap-2 rounded-landing border border-white/30 bg-white/10 px-3 py-3 text-sm font-medium text-white md:mb-8 md:px-4 md:font-semibold"
    : "mb-5 flex items-center gap-2 rounded-landing border border-landing-border bg-landing-surface-container-lowest px-3 py-3 text-sm font-medium text-landing-deep md:mb-8 md:px-4 md:font-semibold";
  return (
    <div className={box}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 fill-none ${onDark ? "stroke-white" : "stroke-landing-primary"}`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
      <span>{text}</span>
    </div>
  );
}

export function Hero({ data, register, sectionIds }: SectionProps) {
  const style = str(data, "heroStyle");
  const pc = str(data, "imagePc");
  const phone = str(data, "imagePhone");
  if (style === "photo") return <PhotoHero data={data} register={register} sectionIds={sectionIds} pc={pc} phone={phone} />;
  if (style === "poster" && (pc || phone)) return <PosterHero data={data} register={register} sectionIds={sectionIds} pc={pc} phone={phone} />;
  return <ClassicHero data={data} register={register} sectionIds={sectionIds} />;
}

function PhotoHero({ data, register, sectionIds, pc, phone }: SectionProps & { pc: string; phone: string }) {
  const eyebrow = str(data, "eyebrow");
  const headline = str(data, "headline");
  const sub = str(data, "subheadline");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const target = secondaryTarget(data, sectionIds);
  const badges = rows(data, "badges").map((b) => str(b, "text")).filter(Boolean);
  const hasImage = pc !== "" || phone !== "";
  const ink = hasImage ? "text-white" : "text-landing-deep";

  return (
    <div className={`relative isolate border-b border-landing-border ${hasImage ? "flex min-h-[34rem] flex-col justify-end bg-landing-deep md:min-h-[32rem]" : "bg-gradient-to-b from-landing-surface-container-lowest to-landing-surface"}`}>
      {hasImage ? (
        <>
          {/* Only the picture layer is clipped, so the Register menu can open past the hero edge. */}
          <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
            <LandingPicture pc={pc} phone={phone} alt="" fit="cover" priority className="!absolute inset-0 !aspect-auto md:!aspect-auto" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/35" />
          </div>
        </>
      ) : null}
      <div className={`mx-auto w-full max-w-7xl px-4 pb-8 pt-16 md:px-6 lg:py-20 ${ink}`}>
        <div className="flex max-w-3xl flex-col items-start">
          {eyebrow ? (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-landing-mint/40 bg-landing-mint-light px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-landing-deep md:mb-6 md:px-3 md:py-1.5 md:text-xs">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-landing-primary" />
              {eyebrow}
            </div>
          ) : null}
          {headline ? (
            <h1 className={`mb-3 break-words font-headline text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl md:mb-6 lg:text-[52px] lg:leading-[1.15] ${ink}`}>{headline}</h1>
          ) : null}
          {sub ? <p className={`mb-4 max-w-2xl break-words text-base leading-relaxed md:mb-6 lg:text-lg ${hasImage ? "text-white/90" : "text-landing-on-surface"}`}>{sub}</p> : null}
          {dateLine ? <DateLine text={dateLine} onDark={hasImage} /> : null}
          <div className="mb-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-6">
            <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
            {target ? <SecondaryButton target={target} label={secondaryLabel} onDark={hasImage} /> : null}
          </div>
          {badges.length > 0 ? (
            <ul className={`grid w-full grid-cols-1 gap-2 border-t pt-5 sm:grid-cols-3 sm:gap-4 ${hasImage ? "border-white/30" : "border-landing-border"}`}>
              {badges.map((b, i) => (
                <li key={i} className={`flex items-center gap-2.5 break-words text-xs font-medium ${hasImage ? "text-white" : "text-landing-deep"}`}>
                  <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-landing-mint/30 text-xs font-bold text-landing-primary">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// The finished poster carries its own text, so it is shown whole (never cropped) with only the buttons below.
function PosterHero({ data, register, sectionIds, pc, phone }: SectionProps & { pc: string; phone: string }) {
  const headline = str(data, "headline");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const target = secondaryTarget(data, sectionIds);
  return (
    <div className="border-b border-landing-border bg-landing-surface">
      {headline ? <h1 className="sr-only">{headline}</h1> : null}
      <LandingPicture pc={pc} phone={phone} alt={headline} fit="contain" priority className="mx-auto max-w-7xl bg-landing-surface-container-lowest" />
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-6 md:px-6 md:py-8">
        {dateLine ? <DateLine text={dateLine} /> : null}
        <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
          {target ? <SecondaryButton target={target} label={secondaryLabel} /> : null}
        </div>
      </div>
    </div>
  );
}

function ClassicHero({ data, register, sectionIds }: SectionProps) {
  const eyebrow = str(data, "eyebrow");
  const headline = str(data, "headline");
  const sub = str(data, "subheadline");
  const image = str(data, "image");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const target = secondaryTarget(data, sectionIds);
  const badges = rows(data, "badges").map((b) => str(b, "text")).filter(Boolean);

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
            {dateLine ? <DateLine text={dateLine} /> : null}
            <div className="mb-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-8">
              <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
              {target ? <SecondaryButton target={target} label={secondaryLabel} /> : null}
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
            // The frame carries the border and shadow: overflow-hidden clips anything the img itself draws.
            // object-contain keeps square posters and wide banners whole inside the fixed 3:2 box (no crop, no CLS).
            <div className="aspect-[3/2] overflow-hidden rounded-landing border border-landing-border bg-landing-surface-container-lowest shadow-landing-soft-lg lg:col-span-5 lg:border-4 lg:border-landing-surface-container-lowest">
              <LandingImage
                src={image}
                alt={headline}
                width={1200}
                height={800}
                priority
                className="h-full w-full object-contain"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
