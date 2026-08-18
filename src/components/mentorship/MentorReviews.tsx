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
 * D-mentor-reviews.html, but retinted to the brand- / font-montserrat /
 * font-poppins marketing system every other component on this page uses
 * (see MentorCard.tsx, MentorProfileClient.tsx) instead of the pz- M3
 * dashboard aliases the Stitch export ported 1:1 by default — this screen
 * lands on a public marketing page, not a dashboard, so the dashboard
 * token set was the wrong substitution. Material Symbols icon names are
 * still mapped to their lucide-react equivalents (star, star_half,
 * format_quote, arrow_forward, reviews → Star, StarHalf, Quote,
 * ArrowRight, Inbox), matching how every other Stitch port in this
 * codebase swaps Material Symbols for lucide.
 */

const INITIAL_VISIBLE = 4;

const AVATAR_PALETTE = [
  { bg: "bg-brand-green/10", text: "text-brand-green" },
  { bg: "bg-brand-gold/15", text: "text-brand-green" },
  { bg: "bg-gray-100", text: "text-gray-600" },
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
    <span className="inline-flex items-center gap-0.5 text-brand-gold" aria-label={`${avg.toFixed(1)} out of 5 stars`}>
      {states.map((state, i) =>
        state === "full" ? (
          <Star key={i} style={{ width: size, height: size }} className="fill-brand-gold text-brand-gold" />
        ) : state === "half" ? (
          <StarHalf key={i} style={{ width: size, height: size }} className="fill-brand-gold text-brand-gold" />
        ) : (
          <Star key={i} style={{ width: size, height: size }} className="text-gray-200" />
        ),
      )}
    </span>
  );
}

function DistributionBar({ star, count, total }: { star: 1 | 2 | 3 | 4 | 5; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="font-poppins text-xs text-gray-500 w-14 text-right shrink-0">
        {star} star{star === 1 ? "" : "s"}
      </span>
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-brand-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-poppins text-xs text-gray-500 w-6 text-right shrink-0">{count}</span>
    </div>
  );
}

function ReviewCard({ review, palette }: { review: MentorReview; palette: { bg: string; text: string } }) {
  const avatar = review.isFeatured ? { bg: "bg-brand-gold/15", text: "text-brand-green" } : palette;

  return (
    <div
      className={
        review.isFeatured
          ? "bg-gray-50 border-2 border-brand-gold rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden"
          : "bg-gray-50 border border-gray-100 rounded-xl p-5 flex flex-col gap-3"
      }
    >
      {review.isFeatured && (
        <div className="absolute top-0 right-0 bg-brand-gold/10 text-brand-gold font-poppins text-xs font-semibold px-2 py-1 rounded-bl-lg">
          Featured
        </div>
      )}
      <div className="flex justify-between items-start gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-10 h-10 shrink-0 rounded-full ${avatar.bg} ${avatar.text} flex items-center justify-center font-montserrat font-bold text-sm`}>
            {initials(review.name)}
          </span>
          <div className="min-w-0">
            <p className="font-montserrat text-sm font-semibold text-brand-black truncate">{review.name}</p>
            <p className="font-poppins text-xs text-gray-400">{relativeTime(review.submittedAt)}</p>
          </div>
        </div>
        {review.avgStars != null && <StarRow avg={review.avgStars} size={14} />}
      </div>
      <div className="flex gap-2 items-start">
        <Quote className="w-4 h-4 text-brand-gold/30 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="font-poppins text-sm text-gray-700 leading-relaxed line-clamp-4 flex-1">{review.comment}</p>
      </div>
      <div className="mt-auto pt-2 border-t border-gray-100 flex items-center gap-1.5 text-gray-400">
        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="font-poppins text-xs">{review.sessionName}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div>
      <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-1">What Mentees Say</h2>
      <p className="font-poppins text-sm text-gray-500 mb-5">Verified feedback from completed sessions</p>
      <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center text-center gap-3 min-h-[220px]">
        <Inbox className="w-10 h-10 text-gray-300" aria-hidden="true" />
        <div>
          <h3 className="font-montserrat text-base font-semibold text-brand-black">No reviews yet</h3>
          <p className="font-poppins text-sm text-gray-500 mt-1 max-w-sm">
            Complete your first session to start receiving feedback.
          </p>
        </div>
      </div>
    </div>
  );
}

export function MentorReviews({
  summary,
  reviews,
  showReviews,
}: {
  summary: MentorReviewSummary;
  reviews: MentorReview[];
  showReviews: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  // When the mentor has turned the section off, render nothing at all — not
  // the zero-reviews EmptyState, which would falsely assert "no reviews yet"
  // to the public even when real reviews exist behind the flag. This is
  // distinct from the genuine "reviews are on but count is zero" case below.
  if (!showReviews) return null;

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
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 flex flex-col md:flex-row gap-8 items-center md:items-start mb-5">
        <div className="flex flex-col items-center md:items-start min-w-[180px]">
          <div className="font-montserrat text-4xl font-bold text-brand-black flex items-baseline gap-1.5">
            {summary.avg != null ? summary.avg.toFixed(1) : "—"}
            <span className="font-poppins text-base text-gray-400">/ 5</span>
          </div>
          {summary.avg != null && (
            <div className="mt-2">
              <StarRow avg={summary.avg} size={18} />
            </div>
          )}
          <p className="font-poppins text-xs text-gray-500 mt-2">
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
            className="px-5 py-2 rounded-full border border-gray-200 text-brand-green font-poppins text-sm font-semibold hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
          >
            Show all {summary.count} review{summary.count === 1 ? "" : "s"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
