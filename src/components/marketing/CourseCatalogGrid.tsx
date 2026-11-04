"use client";

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { CourseCard } from "./CourseCard";
import { PromoSlot } from "./PromoSlot";
import { MarketingHero } from "./MarketingHero";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";
import { PROMO_AFTER, type Promo } from "@/lib/marketing/promo";

export type CatalogHero = { kicker: ReactNode; title: ReactNode; text: ReactNode };

/**
 * Hero search + count bar + card grid for one program type (/courses and
 * /workshops; Stitch "Courses List" / "Workshops List"). Each page passes its
 * own type's rows. The design's topic chips and Level / Price / Sort menus
 * are left out on purpose: there is no data behind them yet.
 */
export function CourseCatalogGrid({
  courses,
  noun = "Course",
  promo = null,
  emptyNext,
  hero,
  gridId,
}: {
  courses: CourseCardData[];
  noun?: string;
  /** In-feed "Featured" card; hidden while searching. */
  promo?: Promo | null;
  /** Shown when nothing at all is listed, so the page is never a dead end. */
  emptyNext?: { label: string; href: string };
  /** The dark top band. When given, the search box sits inside it. */
  hero?: CatalogHero;
  /** id for the grid section, so "Explore" links can jump to it. */
  gridId?: string;
}) {
  const [query, setQuery] = useState("");
  const gridRef = useRef<HTMLElement>(null);
  const word = noun.toLowerCase();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.tagline?.toLowerCase().includes(q) ||
        c.mentorName?.toLowerCase().includes(q),
    );
  }, [courses, query]);

  const empty = courses.length === 0;

  const search = empty ? null : (
    <div role="search" className="mx-auto flex w-full max-w-2xl items-center rounded-full bg-pz-surface-container-lowest p-1.5 shadow-xl">
      <Search className="ml-4 mr-2 h-5 w-5 shrink-0 text-pz-outline" aria-hidden="true" />
      <input
        type="search"
        aria-label={`Search ${word}s`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${word}s`}
        className="min-h-11 w-full min-w-0 bg-transparent font-poppins text-base text-pz-on-surface placeholder:text-pz-outline focus:outline-none"
      />
      <button
        type="button"
        onClick={() => gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-pz-bright px-5 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-sm transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-bright"
      >
        Search <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      </button>
    </div>
  );

  const showPromo = promo !== null && !query.trim() && filtered.length > 0;
  const promoAt = Math.min(PROMO_AFTER, filtered.length);
  const count = filtered.length;

  return (
    <>
      {hero && (
        <MarketingHero kicker={hero.kicker} title={hero.title} text={hero.text}>
          {search}
        </MarketingHero>
      )}

      {!empty && (
        <div className="w-full bg-pz-surface-container-lowest px-5 py-3.5 shadow-sm md:px-6">
          <div className="mx-auto flex max-w-[1320px] items-center justify-end gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-pz-solid-mid" />
            <p aria-live="polite" className="font-montserrat text-[15px] font-bold text-pz-deep">
              {count} {word}
              {count === 1 ? "" : "s"} available
            </p>
          </div>
        </div>
      )}

      <section ref={gridRef} id={gridId} aria-label={`All ${word}s`} className="w-full scroll-mt-24 bg-pz-web-surface px-5 py-12 md:px-6">
        <div className="mx-auto max-w-[1320px]">
          {!hero && search && <div className="mb-8">{search}</div>}

          {empty ? (
            <div className="py-16 text-center">
              <p className="mb-6 font-poppins text-pz-muted">No {word}s are open right now — check back soon.</p>
              {emptyNext && (
                <Link href={emptyNext.href} className="inline-flex min-h-11 items-center rounded-full bg-pz-solid-forest px-6 py-3 font-poppins text-sm font-bold text-white transition-colors hover:bg-pz-solid-mid">
                  {emptyNext.label}
                </Link>
              )}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((course, i) => (
                <Fragment key={course.id}>
                  <div data-grid-item={course.id} className="contents">
                    <CourseCard course={course} layout="list" />
                  </div>
                  {showPromo && i === promoAt - 1 && (
                    <div data-grid-item="promo" className="contents">
                      <PromoSlot promo={promo} variant="card" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          ) : (
            <p className="py-16 text-center font-poppins text-pz-muted">No {word}s match your search.</p>
          )}
        </div>
      </section>
    </>
  );
}
