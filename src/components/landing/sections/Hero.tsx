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

/** Whether the hero shows a picture, following the same style branches as Hero() (old pictures from another style stay in the data but are not shown). */
export function heroPicture(data: Record<string, unknown>): boolean {
  const style = str(data, "heroStyle");
  const wide = str(data, "imagePc") !== "" || str(data, "imagePhone") !== "";
  if (style === "fade" || style === "editorial" || style === "photo") return wide;
  if (style === "poster") return wide || str(data, "image") !== "";
  return str(data, "image") !== "";
}

export function Hero({ data, register, sectionIds }: SectionProps) {
  const style = str(data, "heroStyle");
  const pc = str(data, "imagePc");
  const phone = str(data, "imagePhone");
  if (style === "fade") return <FadeHero data={data} register={register} sectionIds={sectionIds} pc={pc} phone={phone} />;
  if (style === "split") return <SplitHero data={data} register={register} sectionIds={sectionIds} />;
  if (style === "editorial") return <EditorialHero data={data} register={register} sectionIds={sectionIds} pc={pc} phone={phone} />;
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
          <div data-hero-cta className="mb-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-6">
            <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
            {target ? <SecondaryButton target={target} label={secondaryLabel} onDark={hasImage} /> : null}
          </div>
          {badges.length > 0 ? (
            <ul className={`flex w-full flex-wrap gap-x-4 gap-y-2 border-t pt-5 sm:grid sm:grid-cols-3 sm:gap-4 ${hasImage ? "border-white/30" : "border-landing-border"}`}>
              {badges.map((b, i) => (
                <li key={i} className={`flex min-w-0 max-w-full items-center gap-2.5 break-words text-xs font-medium ${hasImage ? "text-white" : "text-landing-deep"}`}>
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
        <div data-hero-cta className="flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
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
            <div data-hero-cta className="mb-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-8">
              <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
              {target ? <SecondaryButton target={target} label={secondaryLabel} /> : null}
            </div>
            {badges.length > 0 ? (
              <ul className="flex w-full flex-wrap gap-x-4 gap-y-2 border-t border-landing-border pt-5 sm:grid sm:grid-cols-3 sm:gap-4">
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

/** Green fade over the photo for Style 1; an unknown value gives the medium fade. Bottom-up on phones, left-to-right from md. */
export function fadeOverlayClass(fade: string): string {
  const dir = "bg-gradient-to-t md:bg-gradient-to-r";
  if (fade === "light") return `${dir} from-landing-deep/80 via-landing-deep/40 to-transparent`;
  if (fade === "strong") return `${dir} from-landing-deep via-landing-deep/85 to-landing-deep/50`;
  return `${dir} from-landing-deep/90 via-landing-deep/65 to-landing-deep/20`;
}

function Eyebrow({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider md:mb-6 md:px-3 md:py-1.5 md:text-xs ${dark ? "border-white/30 bg-white/10 text-white" : "border-landing-mint/40 bg-landing-mint-light text-landing-deep"}`}>
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dark ? "bg-landing-mint" : "bg-landing-primary"}`} />
      {text}
    </div>
  );
}

function Check() {
  return <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-landing-mint/30 text-xs font-bold text-landing-primary">✓</span>;
}

// Style 1: the photo fills the hero behind the text; a green fade (Light / Medium / Strong) keeps the words readable.
function FadeHero({ data, register, sectionIds, pc, phone }: SectionProps & { pc: string; phone: string }) {
  const eyebrow = str(data, "eyebrow");
  const headline = str(data, "headline");
  const sub = str(data, "subheadline");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const target = secondaryTarget(data, sectionIds);
  const badges = rows(data, "badges").map((b) => str(b, "text")).filter(Boolean);
  const hasImage = pc !== "" || phone !== "";
  return (
    <div className="relative isolate flex min-h-[34rem] flex-col justify-end border-b border-landing-border bg-landing-deep md:min-h-[32rem]">
      {hasImage ? (
        // Only the picture layer is clipped, so the Register menu can open past the hero edge.
        <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
          <LandingPicture pc={pc} phone={phone} alt="" fit="cover" priority className="!absolute inset-0 !aspect-auto md:!aspect-auto" />
          <div className={`absolute inset-0 ${fadeOverlayClass(str(data, "heroFade"))}`} />
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-16 text-white md:px-6 lg:py-20">
        <div className="flex max-w-3xl flex-col items-start">
          {eyebrow ? <Eyebrow text={eyebrow} dark /> : null}
          {headline ? <h1 className="mb-3 max-w-full break-words font-headline text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:mb-6 lg:text-[52px] lg:leading-[1.15]">{headline}</h1> : null}
          {sub ? <p className="mb-4 max-w-2xl break-words text-base leading-relaxed text-white/90 md:mb-6 lg:text-lg">{sub}</p> : null}
          {dateLine ? <DateLine text={dateLine} onDark /> : null}
          <div data-hero-cta className="mb-5 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-6">
            <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
            {target ? <SecondaryButton target={target} label={secondaryLabel} onDark /> : null}
          </div>
        </div>
        {badges.length > 0 ? (
          // Phones: plain ticked lines, no box. From sm up: the frosted box.
          <ul className="mt-1 flex w-full flex-wrap gap-x-4 gap-y-1.5 sm:mt-2 sm:grid sm:grid-cols-3 sm:gap-4 sm:rounded-landing sm:border sm:border-white/20 sm:bg-white/10 sm:p-4 sm:backdrop-blur-sm">
            {badges.map((b, i) => (
              <li key={i} className="flex min-w-0 max-w-full items-start gap-2 break-words text-xs font-medium text-white sm:gap-2.5 sm:text-sm">
                <Check />
                <span className="min-w-0 break-words">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// Style 2: light page, text on the left, a framed portrait on the right (text first on phones).
function SplitHero({ data, register, sectionIds }: SectionProps) {
  const eyebrow = str(data, "eyebrow");
  const headline = str(data, "headline");
  const sub = str(data, "subheadline");
  const image = str(data, "image");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const target = secondaryTarget(data, sectionIds);
  const badges = rows(data, "badges").map((b) => str(b, "text")).filter(Boolean);
  return (
    <div className="border-b border-landing-border bg-gradient-to-b from-landing-surface-container-lowest to-landing-surface">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 md:px-6 lg:py-16">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-14">
          <div className={`flex min-w-0 flex-col items-start ${image ? "lg:col-span-7" : "lg:col-span-12"}`}>
            {eyebrow ? <Eyebrow text={eyebrow} /> : null}
            {headline ? <h1 className="mb-3 max-w-full break-words font-headline text-2xl font-extrabold leading-tight tracking-tight text-landing-deep sm:text-4xl md:mb-6 lg:text-[52px] lg:leading-[1.15]">{headline}</h1> : null}
            {sub ? <p className="mb-4 max-w-2xl break-words text-base leading-relaxed text-landing-on-surface md:mb-6 lg:text-lg">{sub}</p> : null}
            {dateLine ? <DateLine text={dateLine} /> : null}
            <div data-hero-cta className="mb-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:mb-8">
              <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
              {target ? <SecondaryButton target={target} label={secondaryLabel} /> : null}
            </div>
            {badges.length > 0 ? (
              <ul className="flex w-full flex-wrap gap-2 sm:grid sm:grid-cols-3 sm:gap-3">
                {badges.map((b, i) => (
                  <li key={i} className="flex min-w-0 max-w-full items-start gap-2 break-words rounded-landing border border-landing-border bg-landing-surface-container-lowest p-2 text-xs font-medium sm:gap-2.5 sm:p-3 sm:text-sm text-landing-deep shadow-landing-soft-lg">
                    <Check />
                    <span className="min-w-0 break-words">{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {image ? (
            <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border-4 border-landing-mint/50 bg-landing-surface-container-lowest shadow-landing-soft-lg lg:col-span-5 lg:max-w-none">
              <LandingImage src={image} alt={headline} width={800} height={1000} priority className="h-full w-full object-cover" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Style 3: flat green, centred serif headline, then a wide framed photo below the text.
function EditorialHero({ data, register, sectionIds, pc, phone }: SectionProps & { pc: string; phone: string }) {
  const eyebrow = str(data, "eyebrow");
  const headline = str(data, "headline");
  const sub = str(data, "subheadline");
  const dateLine = str(data, "dateLine");
  const secondaryLabel = str(data, "secondaryCtaLabel");
  const target = secondaryTarget(data, sectionIds);
  const badges = rows(data, "badges").map((b) => str(b, "text")).filter(Boolean);
  const hasImage = pc !== "" || phone !== "";
  return (
    <div className="border-b border-landing-border bg-landing-deep text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pb-10 pt-12 text-center md:px-6 lg:pb-16 lg:pt-20">
        {eyebrow ? <Eyebrow text={eyebrow} dark /> : null}
        {headline ? <h1 className="mb-4 max-w-full break-words font-serif text-3xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">{headline}</h1> : null}
        {sub ? <p className="mb-6 max-w-full break-words text-base leading-relaxed text-white/90 lg:max-w-2xl lg:text-lg">{sub}</p> : null}
        <div data-hero-cta className="mb-6 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <RegisterButton register={register} label={ctaLabel(str(data, "primaryCtaLabel"), register.label)} size="lg" arrow className="w-full sm:w-auto" />
          {target ? <SecondaryButton target={target} label={secondaryLabel} onDark /> : null}
        </div>
        {dateLine ? <p className="mb-4 max-w-full break-words text-sm font-semibold text-white/90">{dateLine}</p> : null}
        {badges.length > 0 ? (
          <ul className="mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm font-medium text-white/90">
            {badges.map((b, i) => (
              <li key={i} className="flex items-center gap-3 break-words">
                {i > 0 ? <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-white/60 sm:inline-block" /> : null}
                <span className="min-w-0 break-words">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {hasImage ? (
          <div className="w-full max-w-4xl overflow-hidden rounded-landing border border-white/20 shadow-landing-soft-lg">
            <LandingPicture pc={pc} phone={phone} alt={headline} fit="cover" priority className="!aspect-[4/3] md:!aspect-[16/9]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
