import Link from "next/link";
import { BadgeCheck, CalendarClock, Star } from "lucide-react";
import type { Mentor } from "@/lib/data/mentors";
import type { MentorReviewSummary } from "@/lib/data/mentor-reviews";
import { formatPrice, initials } from "@/lib/format";
import { mentorField, priceFrom } from "@/lib/mentorship/catalog";
import { MentorTierBadge } from "./MentorTierBadge";

/**
 * Mentor card on /mentorship (Stitch "1-on-1 Mentorship" card, PZ tokens).
 * Everything on it is the mentor's own profile data; the rating shows only
 * when real public reviews exist.
 */
export function PremiumMentorCard({ mentor, rating }: { mentor: Mentor; rating?: MentorReviewSummary }) {
  const field = mentorField(mentor);
  const from = priceFrom(mentor);
  const skills = mentor.skills.map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== field.toLowerCase()).slice(0, 3);
  const when = mentor.availability.trim() || mentor.sessionDurationText.trim();
  const rated = rating && rating.count > 0 && rating.avg != null;

  return (
    <article
      aria-label={mentor.name}
      className="group flex h-full flex-col justify-between rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(15,61,34,0.05)] transition-shadow duration-300 hover:shadow-[0_16px_48px_rgba(15,61,34,0.14)]"
    >
      <div>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="relative shrink-0">
            <div className="h-20 w-20 overflow-hidden rounded-2xl bg-pz-web-surface-high ring-2 ring-pz-bright/40">
              {mentor.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mentor.photo} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-montserrat text-2xl font-bold text-pz-mid">{initials(mentor.name)}</span>
              )}
            </div>
            <span title="Verified by PZ Academy" className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-pz-surface-container-lowest bg-pz-bright">
              <BadgeCheck className="h-3.5 w-3.5 text-pz-solid-deep" aria-hidden="true" />
              <span className="sr-only">Verified by PZ Academy</span>
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-end gap-1.5">
            <MentorTierBadge tier={mentor.tier} />
            {rated && (
              <p className="flex items-center gap-1 font-poppins text-xs font-bold text-pz-ink">
                <Star className="h-3.5 w-3.5 fill-pz-gold text-pz-gold" aria-hidden="true" />
                {rating.avg!.toFixed(1)}
                <span className="font-normal text-pz-muted">({rating.count} {rating.count === 1 ? "review" : "reviews"})</span>
              </p>
            )}
          </div>
        </div>

        <h3 className="break-words font-montserrat text-xl font-bold leading-snug text-pz-deep">{mentor.name}</h3>
        {mentor.title && <p className="mt-1 break-words font-poppins text-[13px] font-medium leading-snug text-pz-muted">{mentor.title}</p>}

        {(field || skills.length > 0) && (
          <ul aria-label="Fields" className="my-4 flex flex-wrap gap-1.5">
            {field && <li className="max-w-full break-words rounded-lg bg-pz-web-surface-high px-2.5 py-1 font-poppins text-[12px] font-semibold text-pz-deep">{field}</li>}
            {skills.map((s) => (
              <li key={s} className="max-w-full break-words rounded-lg bg-pz-web-surface-low px-2.5 py-1 font-poppins text-[12px] font-medium text-pz-ink">{s}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4 border-t border-pz-border pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="font-poppins text-[11px] font-bold uppercase tracking-wider text-pz-muted">Fee</p>
            <p className="font-montserrat text-base font-extrabold text-pz-deep">
              {from === null ? "Ask for the fee" : <>From {formatPrice(from)} <span className="font-poppins text-xs font-normal text-pz-muted">/ session</span></>}
            </p>
          </div>
          {when && (
            <p className="flex min-w-0 items-start gap-1 text-right font-poppins text-xs font-semibold text-pz-ink">
              <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0 text-pz-mid" aria-hidden="true" />
              <span className="min-w-0 break-words">{when}</span>
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/mentorship/mentors/${mentor.slug}`}
            aria-label={`View profile of ${mentor.name}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-pz-solid-mid px-3 font-montserrat text-sm font-bold text-pz-deep transition-colors hover:bg-pz-web-surface-low"
          >
            View profile
          </Link>
          <Link
            href={`/mentorship/book/${mentor.slug}`}
            aria-label={`Book a session with ${mentor.name}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-pz-bright px-3 font-montserrat text-sm font-bold text-pz-solid-deep shadow-sm transition-transform hover:scale-[1.02]"
          >
            Book session
          </Link>
        </div>
      </div>
    </article>
  );
}
