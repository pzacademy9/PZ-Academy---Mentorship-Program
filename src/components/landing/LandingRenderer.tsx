// src/components/landing/LandingRenderer.tsx
import { SECTION_DEFS, type SectionType } from "@/lib/landing/sections";
import { normalizeContent, type LandingContent, type LandingSection, type PageKind, type PageStatus } from "@/lib/landing/content";
import { Countdown } from "./Countdown";
import { LandingFooter } from "./LandingFooter";
import { MobileMenu, type NavItem } from "./MobileMenu";
import { RegisterButton, ctaLabel } from "./RegisterButton";
import { Hero } from "./sections/Hero";
import { Stats } from "./sections/Stats";
import { RichText } from "./sections/RichText";
import { FeatureCards } from "./sections/FeatureCards";
import { Curriculum } from "./sections/Curriculum";
import { Instructors } from "./sections/Instructors";
import { PricingCards } from "./sections/PricingCards";
import { Schedule } from "./sections/Schedule";
import { VideoReviews } from "./sections/VideoReviews";
import { Testimonials } from "./sections/Testimonials";
import { Faq } from "./sections/Faq";
import { FinalCta } from "./sections/FinalCta";
import type { SectionProps } from "./sections/types";

export type { SectionProps };

const SECTION_COMPONENTS: Record<SectionType, (p: SectionProps) => React.ReactNode> = {
  hero: Hero, stats: Stats, rich_text: RichText, feature_cards: FeatureCards, curriculum: Curriculum,
  instructors: Instructors, pricing_cards: PricingCards, schedule: Schedule, video_reviews: VideoReviews,
  testimonials: Testimonials, faq: Faq, final_cta: FinalCta,
};

export function LandingRenderer({
  content, status, kind: _kind, pageTitle,
}: { content: LandingContent; status: PageStatus; kind: PageKind; pageTitle?: string }) {
  // Re-normalize so a damaged snapshot can never crash the page (Review Focus 1).
  const c = normalizeContent(content);
  const closed = status === "closed";
  const register = { url: c.settings.registerUrl, label: ctaLabel(c.settings.registerLabel), closed };
  const wa = c.settings.whatsappNumber.replace(/\D/g, "");

  // Render each enabled section once; a section with nothing to show returns null and is dropped
  // (so it also gets no wrapper and no nav anchor).
  const rendered = c.sections
    .filter((s: LandingSection) => s.enabled)
    .map((s) => ({ section: s, node: SECTION_COMPONENTS[s.type]({ data: s.data, register }) }))
    .filter((r) => r.node !== null && r.node !== undefined && r.node !== false);

  // Top-nav anchors: one per label (first section wins), so two "About" blocks show once.
  const seen = new Set<string>();
  const navItems: NavItem[] = [];
  for (const { section } of rendered) {
    const label = SECTION_DEFS[section.type].navLabel;
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    navItems.push({ id: section.id, label });
  }
  const title = (pageTitle ?? "").trim();

  return (
    <div
      className="landing-root bg-landing-surface font-landing-body text-landing-on-surface antialiased selection:bg-landing-mint selection:text-landing-deep pb-24 md:pb-0"
      style={{ colorScheme: "light" }}
    >
      <div className="sticky top-0 z-40">
        {c.settings.countdownTo ? <Countdown to={c.settings.countdownTo} label={c.settings.countdownLabel} /> : null}
        <header className="relative border-b border-landing-border bg-landing-surface-container-lowest/95 backdrop-blur-md">
          <nav aria-label="Page" className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 md:h-20 md:px-6">
            <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-landing bg-landing-deep font-headline text-sm font-black text-landing-mint md:h-10 md:w-10 md:text-lg">PZ</span>
              <span className="truncate font-headline text-base font-extrabold leading-tight tracking-tight text-landing-deep md:text-lg">{title || "PZ Academy"}</span>
            </div>
            {navItems.length > 0 ? (
              <ul className="hidden items-center gap-8 text-sm font-semibold text-landing-near-black md:flex">
                {navItems.map((n) => (
                  <li key={n.id}><a href={`#${n.id}`} className="py-1 transition-colors hover:text-landing-primary">{n.label}</a></li>
                ))}
              </ul>
            ) : null}
            <div className="flex shrink-0 items-center gap-1">
              <RegisterButton register={register} size="sm" />
              <MobileMenu items={navItems} register={register} />
            </div>
          </nav>
        </header>
      </div>

      <main>
        {rendered.map(({ section, node }) => (
          <section key={section.id} id={section.id} className="scroll-mt-28">
            {node}
          </section>
        ))}
      </main>

      <LandingFooter title={title} items={navItems} whatsapp={wa} />

      {wa ? (
        <a
          href={`https://wa.me/${wa}`}
          aria-label="Chat on WhatsApp"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-[88px] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-2 border-landing-surface-container-lowest bg-landing-whatsapp text-landing-on-primary shadow-landing-soft-lg transition hover:scale-110 hover:bg-landing-whatsapp-hover active:scale-95 md:bottom-6 md:right-6 md:border-0"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-current md:h-8 md:w-8">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
          </svg>
        </a>
      ) : null}

      {/* Phone only: sticky bottom conversion bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-landing-border bg-landing-surface-container-lowest/95 px-4 pt-3 shadow-landing-bar backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <RegisterButton register={register} size="lg" arrow className="h-12 w-full rounded-landing !py-0" />
      </div>
    </div>
  );
}
