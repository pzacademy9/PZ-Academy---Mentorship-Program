"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Play, Search } from "lucide-react";
import type { CourseCard } from "@/lib/data/lms";
import { PROMO_AFTER, type Promo } from "@/lib/marketing/promo";
import { youtubeThumb } from "@/lib/marketing/youtube-thumb";
import { PromoSlot } from "./PromoSlot";
import { MarketingHero } from "./MarketingHero";
import type { CatalogHero } from "./CourseCatalogGrid";

type Filter = "all" | "upcoming" | "past";

/** "Dr Imad Khan" -> "IK" (title dropped). */
function initials(name: string): string {
  return name
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ w, className }: { w: CourseCard; className: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-pz-solid-deep font-montserrat font-bold text-pz-bright ${className}`}>
      {w.mentorAvatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={w.mentorAvatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(w.mentorName ?? w.title)}</span>
      )}
    </span>
  );
}

function UpcomingRow({ w }: { w: CourseCard }) {
  const free = w.pricePkr <= 0;
  return (
    <article className="rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(25,100,50,0.05)] transition-shadow hover:shadow-[0_12px_40px_rgba(25,100,50,0.12)] lg:p-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center lg:gap-10">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-6 sm:flex-row">
          <div className="relative shrink-0">
            <Avatar w={w} className="h-24 w-24 rounded-[20px] border-2 border-pz-border text-2xl sm:h-28 sm:w-28" />
            <span className="absolute -bottom-2 -right-2 rounded-full bg-pz-solid-deep px-2 py-0.5 font-poppins text-[10px] font-bold tracking-wider text-pz-bright">
              SPEAKER
            </span>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {w.timings && (
                <span className="inline-flex max-w-full items-center gap-1.5 break-words rounded-full bg-pz-solid-deep px-3 py-1 font-poppins text-xs font-bold text-pz-bright">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {w.timings}
                </span>
              )}
              <span className="rounded-full border border-pz-border bg-pz-web-surface px-2.5 py-1 font-poppins text-xs font-semibold text-pz-deep">
                {free ? "Free" : `PKR ${w.pricePkr.toLocaleString()}`}
              </span>
              <span className="rounded-full border border-pz-border bg-pz-web-surface px-2.5 py-1 font-poppins text-xs font-medium text-pz-muted">Live</span>
            </div>
            <h3 className="break-words font-montserrat text-xl font-extrabold leading-tight text-pz-ink lg:text-2xl">{w.title}</h3>
            {w.tagline && <p className="max-w-3xl font-poppins text-sm leading-relaxed text-pz-muted">{w.tagline}</p>}
            {w.mentorName && (
              <p className="break-words pt-1 font-poppins text-xs text-pz-ink">
                <span className="font-bold">{w.mentorName}</span>
                {w.mentorTitle && <span className="text-pz-muted"> — {w.mentorTitle}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-stretch justify-end border-t border-pz-border pt-4 sm:items-center lg:border-t-0 lg:pt-0">
          <Link
            href={`/courses/${w.slug}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-pz-bright px-7 font-montserrat text-sm font-bold text-pz-solid-deep shadow transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid sm:w-auto"
          >
            {free ? "Register free" : "Register"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function RecordingCard({ w }: { w: CourseCard }) {
  const picture = youtubeThumb(w.publicVideoUrl) ?? w.thumbnailUrl;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-pz-border bg-pz-surface-container-lowest shadow-[0_8px_30px_rgba(25,100,50,0.05)] transition-shadow hover:shadow-[0_12px_40px_rgba(25,100,50,0.12)]">
      <div className="relative aspect-video w-full overflow-hidden bg-pz-web-surface-high">
        {picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        )}
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-md">
            <Play className="ml-0.5 h-5 w-5 fill-pz-solid-deep text-pz-solid-deep" />
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        {w.mentorName && (
          <div className="mb-3 flex items-center gap-2">
            <Avatar w={w} className="h-6 w-6 rounded-full text-[10px]" />
            <span className="truncate font-poppins text-xs text-pz-muted">{w.mentorName}</span>
          </div>
        )}
        <h3 className="break-words font-montserrat text-lg font-bold leading-snug text-pz-ink">{w.title}</h3>
        {w.tagline && <p className="mt-2 line-clamp-2 font-poppins text-[13px] leading-relaxed text-pz-muted">{w.tagline}</p>}
        <div className="mt-auto pt-4"><div className="border-t border-pz-border pt-3">
          <Link
            href={`/courses/${w.slug}`}
            className="inline-flex min-h-11 items-center gap-1.5 font-montserrat text-sm font-bold text-pz-mid transition-colors hover:text-pz-deep"
          >
            Watch recording <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div></div>
      </div>
    </article>
  );
}

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Recorded" },
];

/**
 * /webinars list (Stitch "Webinars List"). `open` webinars are upcoming
 * (wide rows with Register), `closed` ones are recordings (video cards with
 * the YouTube still). Every webinar's full detail lives at /courses/[slug].
 */
export function WebinarGrid({ webinars, promo = null, hero }: { webinars: CourseCard[]; promo?: Promo | null; hero?: CatalogHero }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matching = useMemo(
    () =>
      q
        ? webinars.filter(
            (w) => w.title.toLowerCase().includes(q) || w.tagline?.toLowerCase().includes(q) || w.mentorName?.toLowerCase().includes(q),
          )
        : webinars,
    [webinars, q],
  );
  const upcoming = matching.filter((w) => w.status === "open");
  // Anything not open (closed, or an older archived row) is a recording, as on the old page.
  const recorded = matching.filter((w) => w.status !== "open");
  const counts: Record<Filter, number> = {
    all: upcoming.length + recorded.length,
    upcoming: upcoming.length,
    past: recorded.length,
  };
  const showUp = filter !== "past" && upcoming.length > 0;
  const showRec = filter !== "upcoming" && recorded.length > 0;
  // Promo only in the full, unsearched list — a filtered view stays exactly what was asked for.
  const promoOn = promo !== null && filter === "all" && !q;
  const promoAt = Math.min(PROMO_AFTER, recorded.length);
  const promoCard = (
    <div data-grid-item="promo" className="contents">
      <PromoSlot promo={promo} variant="card" />
    </div>
  );

  const controls = (
    <div className={`flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-center ${hero ? "border-t border-white/10 pt-8" : "mb-10"}`}>
      <div className={`flex w-fit flex-wrap items-center gap-1 rounded-full p-1.5 ${hero ? "bg-black/20" : "bg-pz-web-surface-high"}`}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            aria-pressed={filter === t.key}
            className={`min-h-11 rounded-full px-5 font-poppins text-sm transition-all ${
              filter === t.key ? "bg-pz-bright font-semibold text-pz-solid-deep shadow-sm" : hero ? "font-medium text-white/80 hover:text-white" : "font-medium text-pz-muted hover:text-pz-deep"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>
      <div className="relative w-full md:w-80">
        <Search className={`pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 ${hero ? "text-white/60" : "text-pz-outline"}`} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search webinars"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics or speakers"
          className={`min-h-11 w-full rounded-full py-2.5 pl-11 pr-4 font-poppins text-base focus:outline-none focus:ring-2 focus:ring-pz-bright md:text-sm ${
            hero ? "bg-white/10 text-white placeholder:text-white/60 focus:bg-white/15" : "border border-pz-border bg-pz-surface-container-lowest text-pz-ink placeholder:text-pz-outline"
          }`}
        />
      </div>
    </div>
  );

  let body: ReactNode;
  if (!showUp && !showRec) {
    body = (
      <>
        <p className="py-16 text-center font-poppins text-pz-muted">
          {q ? "No webinars match your search." : "No webinars in this category yet."}
        </p>
        {promoOn && <div className="mx-auto grid max-w-sm">{promoCard}</div>}
      </>
    );
  } else {
    body = (
      <div className="space-y-16 lg:space-y-24">
        {showUp && (
          <section aria-labelledby="upcoming-title" className="space-y-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <div className="mb-2 flex items-center gap-2.5">
                  <span aria-hidden="true" className="relative flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pz-solid-danger opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-pz-solid-danger" />
                  </span>
                  <span className="font-poppins text-xs font-semibold uppercase tracking-wider text-pz-mid">Live interactive sessions</span>
                </div>
                <h2 id="upcoming-title" className="font-montserrat text-2xl font-black tracking-tight text-pz-ink lg:text-3xl">Upcoming live webinars</h2>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-pz-border bg-pz-surface-container-lowest px-3.5 py-1.5 font-poppins text-xs font-medium text-pz-muted shadow-sm">
                {upcoming.length} live {upcoming.length === 1 ? "session" : "sessions"} open
              </span>
            </div>
            <div className="space-y-6">
              {upcoming.map((w) => (
                <div key={w.id} data-grid-item={w.id}>
                  <UpcomingRow w={w} />
                </div>
              ))}
            </div>
            {promoOn && !showRec && <div className="grid max-w-sm">{promoCard}</div>}
          </section>
        )}
        {showRec && (
          <section aria-labelledby="recorded-title" className="space-y-8">
            <div>
              <span className="mb-2 block font-poppins text-xs font-semibold uppercase tracking-wider text-pz-mid">Watch any time</span>
              <h2 id="recorded-title" className="font-montserrat text-2xl font-black tracking-tight text-pz-ink lg:text-3xl">Recorded sessions</h2>
              <p className="mt-2 font-poppins text-sm text-pz-muted">Missed a session? Catch up on the recording.</p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {recorded.map((w, i) => (
                <Fragment key={w.id}>
                  <div data-grid-item={w.id} className="contents">
                    <RecordingCard w={w} />
                  </div>
                  {promoOn && i === promoAt - 1 && promoCard}
                </Fragment>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <>
      {hero && (
        <MarketingHero kicker={hero.kicker} title={hero.title} text={hero.text} align="left">
          {controls}
        </MarketingHero>
      )}
      <div id="webinars" className="w-full scroll-mt-24 bg-pz-web-surface px-5 py-14 md:px-6 lg:py-20">
        <div className="mx-auto max-w-[1320px]">
          {!hero && controls}
          {body}
        </div>
      </div>
    </>
  );
}
