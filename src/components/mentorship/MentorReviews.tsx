"use client";

import { useState } from "react";
import { Star, StarHalf, Quote, ArrowRight, MessageSquare, Inbox } from "lucide-react";
import { relativeTime, initials } from "@/lib/format";
import type { MentorReview, MentorReviewSummary } from "@/lib/data/mentor-reviews";

/**
 * Presentational only — no "use client" data fetching, no direct DB access.
 * summary/reviews are fetched server-side by src/app/mentorship/mentors/
 * [slug]/page.tsx (a Server Component) and passed down through
 * MentorProfileClient as plain props. This keeps a clean server/client
 * boundary: MentorProfileClient is already a large existing "use client"
 * tree, so a nested async Server Component here would be invalid, and a
 * <Suspense> boundary would be unnecessary ceremony for data the parent
 * page already has in hand before it renders.
 *
 * Ported from docs/superpowers/stitch-screens/2026-08-17-feedback-phase-2/
 * D-mentor-reviews.html — its M3 semantic color classes (surface-container,
 * on-surface, primary-container, …) carry over 1:1 with the pz- prefix per
 * this repo's Stitch convention (tailwind.config.ts:90). Its custom
 * typography scale (font-headline-lg, text-body-md, …) is Stitch-mockup-only
 * and isn't part of this project's Tailwind config, so those are rendered
 * with this repo's own font-headline/font-body utilities and standard
 * Tailwind text sizes instead — the same substitution SessionDetailClient.tsx
 * already makes for the same Stitch project's other screens. Material
 * Symbols icon names are mapped to their lucide-react equivalents (star,
 * star_half, format_quote, arrow_forward, reviews → Star, StarHalf, Quote,
 * ArrowRight, Inbox), matching how every other Stitch port in this codebase
 * swaps Material Symbols for lucide.
 */

const INITIAL_VISIBLE = 4;

const AVATAR_PALETTE = [
  { bg: "bg-pz-secondary-container", text: "text-pz-on-secondary-container" },
  { bg: "bg-pz-tertiary-container", text: "text-pz-on-tertiary-container" },
  { bg: "bg-pz-surface-variant", text: "text-pz-on-surface-variant" },
] as const;

/** Full/half/empty star fill state for a given 0..5 average, one entry per star position. */
function starFillStates(avg: number): ("full" | "half" | "empty")[] {
  return Array.from({ length: 5 }, (_, i) => {
    const threshold = i + 1;
    if (avg >= threshold) return "full";
    if (avg >= threshold - 0.5) return "half";
    return "empty";
  });
}

function StarRow({ avg, size = 16 }: { avg: number; size?: number }) {
  const states = starFillStates(avg);
  return (
    <span className="inline-flex items-center gap-0.5 text-pz-secondary" aria-label={`${avg.toFixed(1)} out of 5 stars`}>
      {states.map((state, i) =>
        state === "full" ? (
          <Star key={i} style={{ width: size, height: size }} className="fill-pz-secondary text-pz-secondary" />
        ) : state === "half" ? (
          <StarHalf key={i} style={{ width: size, height: size }} className="fill-pz-secondary text-pz-secondary" />
        ) : (
          <Star key={i} style={{ width: size, height: size }} className="text-pz-outline-variant" />
        ),
      )}
    </span>
  );
}

function DistributionBar({ star, count, total }: { star: 1 | 2 | 3 | 4 | 5; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="font-label text-xs text-pz-on-surface-variant w-14 text-right shrink-0">
        {star} star{star === 1 ? "" : "s"}
      </span>
      <div className="flex-1 h-2 rounded-full bg-pz-surface-container-highest overflow-hidden">
        <div className="h-full rounded-full bg-pz-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-label text-xs text-pz-on-surface-variant w-6 text-right shrink-0">{count}</span>
    </div>
  );
}

function ReviewCard({ review, palette }: { review: MentorReview; palette: { bg: string; text: string } }) {
  const avatar = review.isFeatured ? { bg: "bg-pz-primary-container", text: "text-pz-on-primary-container" } : palette;

  return (
    <div
      className={
        review.isFeatured
          ? "bg-pz-surface-container border-2 border-pz-primary rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden"
          : "bg-pz-surface-container border border-pz-outline-variant rounded-xl p-5 flex flex-col gap-3"
      }
    >
      {review.isFeatured && (
        <div className="absolute top-0 right-0 bg-pz-primary/10 text-pz-primary font-label text-xs font-semibold px-2 py-1 rounded-bl-lg">
          Featured
        </div>
      )}
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-10 h-10 shrink-0 rounded-full ${avatar.bg} ${avatar.text} flex items-center justify-center font-headline font-bold text-sm`}>
            {initials(review.name)}
          </span>
          <div className="min-w-0">
            <p className="font-headline text-sm font-semibold text-pz-on-surface truncate">{review.name}</p>
            <p className="font-body text-xs text-pz-on-surface-variant">{relativeTime(review.submittedAt)}</p>
          </div>
        </div>
        {review.avgStars != null && <StarRow avg={review.avgStars} size={14} />}
      </div>
      <div className="flex gap-2 items-start">
        <Quote className="w-4 h-4 text-pz-outline-variant shrink-0 mt-0.5" aria-hidden="true" />
        <p className="font-body text-sm text-pz-on-surface leading-relaxed line-clamp-4 flex-1">{review.comment}</p>
      </div>
      <div className="mt-auto pt-2 border-t border-pz-outline-variant flex items-center gap-1.5 text-pz-on-surface-variant">
        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="font-label text-xs">{review.sessionName}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div>
      <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-1">What Mentees Say</h2>
      <p className="font-poppins text-sm text-gray-500 mb-5">Verified feedback from completed sessions</p>
      <div className="bg-pz-surface-container border border-dashed border-pz-outline-variant rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
        <Inbox className="w-10 h-10 text-pz-on-surface-variant opacity-50" aria-hidden="true" />
        <div>
          <h3 className="font-headline text-base font-semibold text-pz-on-surface">No reviews yet</h3>
          <p className="font-body text-sm text-pz-on-surface-variant mt-1 max-w-sm">
            Complete your first session to start receiving feedback.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MentorReviews({ summary, reviews }: { summary: MentorReviewSummary; reviews: MentorReview[] }) {
  const [showAll, setShowAll] = useState(false);

  // Gated on the actual rendered content (reviews.length), not summary.count:
  // a public, commented response with zero star answers (e.g. an all-video
  // question bank) still appears as a review card below but contributes
  // nothing to summary.count's star math in older semantics — count is now
  // fixed to match, but gating on reviews.length directly is the more
  // robust invariant regardless.
  if (reviews.length === 0) return <EmptyState />;

  const visible = showAll ? reviews : reviews.slice(0, INITIAL_VISIBLE);
  const stars = [5, 4, 3, 2, 1] as const;

  return (
    <div>
      <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-1">What Mentees Say</h2>
      <p className="font-poppins text-sm text-gray-500 mb-5">Verified feedback from completed sessions</p>

      {/* Rating Summary Band */}
      <div className="bg-pz-surface-container border border-pz-outline-variant rounded-xl p-5 flex flex-col md:flex-row gap-8 items-center md:items-start mb-5">
        <div className="flex flex-col items-center md:items-start min-w-[180px]">
          <div className="font-headline text-4xl font-bold text-pz-on-surface flex items-baseline gap-1.5">
            {summary.avg != null ? summary.avg.toFixed(1) : "—"}
            <span className="font-body text-base text-pz-on-surface-variant">/ 5</span>
          </div>
          {summary.avg != null && (
            <div className="mt-2">
              <StarRow avg={summary.avg} size={18} />
            </div>
          )}
          <p className="font-body text-xs text-pz-on-surface-variant mt-2">
            Based on {summary.count} review{summary.count === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex-1 w-full max-w-md flex flex-col gap-1.5">
          {stars.map((s) => (
            <DistributionBar key={s} star={s} count={summary.distribution[s]} total={summary.count} />
          ))}
        </div>
      </div>

      {/* Review Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visible.map((review, i) => (
          <ReviewCard key={review.id} review={review} palette={AVATAR_PALETTE[i % AVATAR_PALETTE.length]} />
        ))}
      </div>

      {!showAll && reviews.length > INITIAL_VISIBLE && (
        <div className="flex justify-center mt-5">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="px-5 py-2 rounded-full border border-pz-outline-variant text-pz-primary font-label text-sm font-semibold hover:bg-pz-surface-variant transition-colors inline-flex items-center gap-2"
          >
            Show all {summary.count} review{summary.count === 1 ? "" : "s"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
