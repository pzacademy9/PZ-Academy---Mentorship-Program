"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CourseCard } from "./CourseCard";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

/**
 * Search + grid for a single-type catalog (used by /courses, /workshops, and
 * /webinars, each server-filtering to its own CourseType via
 * getPublishedCourses(type)). No longer has a type-filter tab row — that was
 * only useful back when /courses received every type unfiltered; now each
 * caller already passes one type, so an "all courses / workshops / webinars"
 * tab set would always resolve to a single, redundant option.
 */
export function CourseCatalogGrid({ courses, noun = "Course" }: { courses: CourseCardData[]; noun?: string }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) => c.title.toLowerCase().includes(q) || c.tagline?.toLowerCase().includes(q),
    );
  }, [courses, query]);

  return (
    <div>
      {/* Search */}
      <div className="w-full max-w-xl mx-auto mb-8 group relative">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-pz-outline group-focus-within:text-pz-primary transition-colors" />
        </div>
        <input
          type="text"
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
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} />
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
