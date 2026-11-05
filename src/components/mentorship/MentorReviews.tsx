"use client";

import { useState } from "react";
import { Star, StarHalf, Quote, ArrowRight, MessageSquare, Inbox, MessageSquareQuote } from "lucide-react";
import { relativeTime, initials } from "@/lib/format";
import type { MentorReview, MentorReviewSummary } from "@/lib/data/mentor-reviews";

/**
 * Real student reviews on a mentor's profile (feedback_responses, see
 * src/lib/data/mentor-reviews.ts). Presentational only: the server page
 * fetches summary/reviews and passes them down. Styled with the same PZ
 * tokens as /mentorship (Stitch "Mentor Profile", Platform 2).
 */

const INITIAL_VISIBLE = 4;

/** Full/half/empty star fill state for a given 0..5 average, one entry per star position. */
function starFillStates(avg: number): ("full" | "half" | "empty")[] {
  return Array.from({ length: 5 }, (_, i) => {
    const threshold = i + 1;
    if (avg >= threshold) return "full";
    if (avg >= threshold - 0.5) return "half";
    return "empty";
  });
}

export function StarRow({ avg, size = 16 }: { avg: number; size?: number }) {
  const states = starFillStates(avg);
  return (
    <span role="img" className="inline-flex items-center gap-0.5" aria-label={`${avg.toFixed(1)} out of 5 stars`}>
      {states.map((state, i) =>
        state === "full" ? (
          <Star key={i} style={{ width: size, height: size }} className="fill-pz-gold text-pz-gold" aria-hidden="true" />
        ) : state === "half" ? (
          <StarHalf key={i} style={{ width: size, height: size }} className="fill-pz-gold text-pz-gold" aria-hidden="true" />
        ) : (
          <Star key={i} style={{ width: size, height: size }} className="text-pz-border" aria-hidden="true" />
        ),
      )}
    </span>
  );
}

function DistributionBar({ star, count, total }: { star: 1 | 2 | 3 | 4 | 5; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-right font-poppins text-xs text-pz-muted">
        {star} star{star === 1 ? "" : "s"}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-pz-web-surface-high">
        <div className="h-full rounded-full bg-pz-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right font-poppins text-xs text-pz-muted">{count}</span>
    </div>
  );
}

function ReviewCard({ review }: { review: MentorReview }) {
  return (
    <div
      className={`relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-pz-web-surface-low p-5 ${review.isFeatured ? "ring-2 ring-pz-gold" : ""}`}
    >
      {review.isFeatured && (
        <span className="absolute right-0 top-0 rounded-bl-lg bg-pz-gold/15 px-2 py-1 font-poppins text-xs font-semibold text-pz-ink">Featured</span>
      )}
      {review.avgStars != null && <StarRow avg={review.avgStars} size={14} />}
      <div className="flex items-start gap-2">
        <Quote className="mt-0.5 h-4 w-4 shrink-0 text-pz-mid/40" aria-hidden="true" />
        <p className="line-clamp-5 flex-1 break-words font-poppins text-sm italic leading-relaxed text-pz-ink">{review.comment}</p>
      </div>
      <div className="mt-auto flex items-center gap-2.5 border-t border-pz-border pt-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pz-bright/25 font-montserrat text-xs font-bold text-pz-deep">
          {initials(review.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-montserrat text-sm font-semibold text-pz-deep">{review.name}</p>
          <p className="flex items-center gap-1 truncate font-poppins text-xs text-pz-muted">
            <MessageSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{review.sessionName}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{relativeTime(review.submittedAt)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Heading({ summary }: { summary?: MentorReviewSummary }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h2 id="reviews-title" className="flex items-center gap-3 font-montserrat text-xl font-bold text-pz-deep md:text-2xl">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pz-web-surface-low text-pz-mid">
          <MessageSquareQuote className="h-5 w-5" aria-hidden="true" />
        </span>
        Verified student reviews
      </h2>
      {summary && summary.avg != null && (
        <span className="inline-flex items-center gap-1 rounded-full bg-pz-gold/15 px-3 py-1 font-poppins text-xs font-bold text-pz-ink">
          <Star className="h-3.5 w-3.5 fill-pz-gold text-pz-gold" aria-hidden="true" />
          {summary.avg.toFixed(1)} rating
        </span>
      )}
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

  // Section turned off by the admin: render nothing (not the empty state,
  // which would wrongly say "no reviews yet" when real reviews exist).
  if (!showReviews) return null;

  if (reviews.length === 0) {
    return (
      <div>
        <Heading />
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-pz-border bg-pz-web-surface-low p-8 text-center">
          <Inbox className="h-9 w-9 text-pz-muted/50" aria-hidden="true" />
          <h3 className="font-montserrat text-base font-semibold text-pz-deep">No reviews yet</h3>
          <p className="max-w-sm font-poppins text-sm text-pz-muted">Reviews appear here after students finish their sessions and leave feedback.</p>
        </div>
      </div>
    );
  }

  const visible = showAll ? reviews : reviews.slice(0, INITIAL_VISIBLE);
  const stars = [5, 4, 3, 2, 1] as const;

  return (
    <div>
      <Heading summary={summary} />
      <p className="-mt-3 mb-5 font-poppins text-sm text-pz-muted">Feedback from students after their real sessions.</p>

      {summary.count > 0 && (
        <div className="mb-5 flex flex-col items-center gap-6 rounded-2xl bg-pz-web-surface-low p-5 md:flex-row md:items-start">
          <div className="flex min-w-[160px] flex-col items-center md:items-start">
            <div className="flex items-baseline gap-1.5 font-montserrat text-4xl font-black text-pz-deep">
              {summary.avg != null ? summary.avg.toFixed(1) : "—"}
              <span className="font-poppins text-base font-normal text-pz-muted">/ 5</span>
            </div>
            {summary.avg != null && (
              <div className="mt-2">
                <StarRow avg={summary.avg} size={18} />
              </div>
            )}
            <p className="mt-2 font-poppins text-xs text-pz-muted">
              Based on {summary.count} review{summary.count === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex w-full max-w-md flex-1 flex-col gap-1.5">
            {stars.map((s) => (
              <DistributionBar key={s} star={s} count={summary.distribution[s]} total={summary.count} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visible.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      {!showAll && reviews.length > INITIAL_VISIBLE && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pz-border px-5 font-poppins text-sm font-semibold text-pz-deep transition-colors hover:bg-pz-web-surface-low"
          >
            Show all {reviews.length} reviews
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
