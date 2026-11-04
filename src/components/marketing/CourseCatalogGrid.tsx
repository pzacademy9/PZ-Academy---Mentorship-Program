"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CourseCard } from "./CourseCard";
import { PromoSlot } from "./PromoSlot";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";
import type { Promo } from "@/lib/marketing/promo";

/** Where the in-feed promo card goes: after the 3rd program, or last if fewer. */
export const PROMO_AFTER = 3;

/**
 * Search + grid for a single-type catalog (used by /courses, /workshops, and
 * /webinars, each server-filtering to its own CourseType via
 * getPublishedCourses(type)). No longer has a type-filter tab row — that was
 * only useful back when /courses received every type unfiltered; now each
 * caller already passes one type, so an "all courses / workshops / webinars"
 * tab set would always resolve to a single, redundant option.
 */
export function CourseCatalogGrid({
  courses,
  noun = "Course",
  promo = null,
  emptyNext,
}: {
  courses: CourseCardData[];
  noun?: string;
  /** In-feed "Featured" card; hidden while searching. */
  promo?: Promo | null;
  /** Shown when nothing at all is listed, so the page is never a dead end. */
  emptyNext?: { label: string; href: string };
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) => c.title.toLowerCase().includes(q) || c.tagline?.toLowerCase().includes(q),
    );
  }, [courses, query]);

  if (courses.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-pz-muted font-poppins mb-6">No {noun.toLowerCase()}s are open right now — check back soon.</p>
        {emptyNext && (
          <Link href={emptyNext.href} className="inline-flex min-h-11 items-center rounded-full bg-pz-solid-forest px-6 py-3 font-poppins text-sm font-bold text-white transition-colors hover:bg-pz-solid-mid">
            {emptyNext.label}
          </Link>
        )}
      </div>
    );
  }

  const showPromo = promo !== null && !query.trim() && filtered.length > 0;
  const promoAt = Math.min(PROMO_AFTER, filtered.length);

  return (
    <div>
      {/* Search */}
      <div className="w-full max-w-xl mx-auto mb-8 group relative">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-pz-outline group-focus-within:text-pz-primary transition-colors" />
        </div>
        <input
          type="search"
          aria-label={`Search ${noun.toLowerCase()}s`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${noun.toLowerCase()}s...`}
          className="w-full bg-pz-surface-container-lowest border border-pz-outline-variant rounded-full py-4 pl-14 pr-6 text-sm max-md:text-base text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary transition-all shadow-sm font-body"
        />
      </div>

      <p className="font-label text-pz-secondary text-lg mb-8 text-right">
        {filtered.length} {noun}
        {filtered.length === 1 ? "" : "s"} Found
      </p>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((course, i) => (
            <Fragment key={course.id}>
              <div data-grid-item={course.id} className="contents">
                <CourseCard course={course} />
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
        <p className="text-center text-pz-on-surface-variant font-body py-16">
          No {noun.toLowerCase()}s match your search.
        </p>
      )}
    </div>
  );
}
