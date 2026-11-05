"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Award, BadgeCheck, BookOpen, Briefcase, CalendarClock, ChevronRight, Clock, Globe,
  GraduationCap, Languages, Lightbulb, MessageCircle, PlayCircle, Quote, ShieldCheck, Sparkles,
  Target, Timer, TrendingUp, UserRound, Video, Link2,
  type LucideIcon,
} from "lucide-react";
import type { Mentor } from "@/lib/data/mentors";
import type { MentorReview, MentorReviewSummary } from "@/lib/data/mentor-reviews";
import { formatPrice, initials } from "@/lib/format";
import { formatSessionDuration } from "@/lib/validations/admin-mentor";
import { whatsappLink } from "@/lib/mentorship/whatsapp";
import { mentorField, priceFrom } from "@/lib/mentorship/catalog";
import { toEmbedUrl } from "@/lib/video-embed";
import { detectSocialPlatform, SOCIAL_PLATFORM_LABELS } from "@/lib/social-platforms";
import { LinkedInIcon, BRAND_ICON_BY_PLATFORM } from "./BrandIcons";
import { MentorReviews, StarRow } from "./MentorReviews";
import { MentorTierBadge } from "./MentorTierBadge";
import { HOW_IT_WORKS } from "./MentorshipSections";

/**
 * Public mentor profile (Stitch "Mentor Profile", Platform 2, desktop 1440 +
 * mobile 390), in the same PZ tokens as /mentorship. Every value comes from
 * the mentor's admin record (Admin › Mentors) or from real reviews; the
 * design's sample numbers, slots and promises are deliberately not copied.
 */

const credentialIcons: Record<string, LucideIcon> = { GraduationCap, Award, BookOpen, Lightbulb, TrendingUp };

const card = "rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] sm:p-7";

function SectionTitle({ id, icon: Icon, children }: { id: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-5 flex items-center gap-3 font-montserrat text-xl font-bold text-pz-deep md:text-2xl">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pz-web-surface-low text-pz-mid">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      {children}
    </h2>
  );
}

function sessionLength(m: Mentor): string {
  return m.sessionDurationText.trim() || formatSessionDuration(m.sessionDurationMinutes);
}

/** Default package: the single session when there is one, else the first. */
function defaultPackage(m: Mentor): string {
  return (m.packages.find((p) => p.sessions === 1) ?? m.packages[0])?.name ?? "";
}

function bookHref(m: Mentor, pkg: string): string {
  return `/mentorship/book/${m.slug}${pkg ? `?package=${encodeURIComponent(pkg)}` : ""}`;
}

function BookingCard({ mentor }: { mentor: Mentor }) {
  const [chosen, setChosen] = useState(defaultPackage(mentor));
  const pkg = mentor.packages.find((p) => p.name === chosen);
  const total = pkg?.price ?? (mentor.pricePerSession > 0 ? mentor.pricePerSession : null);

  return (
    <section aria-labelledby="book-card-title" className="overflow-hidden rounded-[24px] border border-pz-border bg-pz-surface-container-lowest shadow-[0_16px_48px_rgba(15,61,34,0.10)]">
      <div className="p-5 sm:p-6">
        <p className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">Private 1-on-1</p>
        <h2 id="book-card-title" className="mt-1 font-montserrat text-xl font-bold text-pz-deep">Book a 1-on-1 session</h2>

        {mentor.packages.length > 0 && (
          <fieldset className="mt-5">
            <legend className="sr-only">Choose a package</legend>
            <div className="space-y-2.5">
              {mentor.packages.map((p) => {
                const on = p.name === chosen;
                return (
                  <label
                    key={p.name}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors ${on ? "border-pz-solid-mid bg-pz-web-surface-low" : "border-pz-border hover:bg-pz-web-surface-low"}`}
                  >
                    <input
                      type="radio"
                      name="profile-package"
                      value={p.name}
                      checked={on}
                      onChange={() => setChosen(p.name)}
                      className="mt-1 h-4 w-4 shrink-0 accent-pz-solid-mid"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-montserrat text-sm font-bold text-pz-deep">{p.name}</span>
                      <span className="block font-poppins text-xs text-pz-muted">
                        {p.sessions} session{p.sessions === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-montserrat text-sm font-extrabold text-pz-deep">{formatPrice(p.price)}</span>
                      {p.savings ? (
                        <span className="mt-0.5 inline-block rounded-full bg-pz-gold/20 px-2 py-0.5 font-poppins text-[10px] font-bold uppercase text-pz-ink">
                          Save {formatPrice(p.savings)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-pz-web-surface-low px-4 py-3">
          <span className="font-poppins text-sm text-pz-muted">Total to pay</span>
          <span data-total className="font-montserrat text-xl font-black text-pz-deep">
            {total === null ? "Ask for the fee" : formatPrice(total)}
          </span>
        </div>

        <Link
          href={bookHref(mentor, pkg?.name ?? "")}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-pz-bright px-5 font-montserrat text-sm font-bold text-pz-solid-deep shadow-sm transition-transform hover:scale-[1.02]"
        >
          Book a session now
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <p className="mt-3 flex items-start gap-2 font-poppins text-xs leading-relaxed text-pz-muted">
          <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-pz-mid" aria-hidden="true" />
          Pay by bank transfer. Our team checks your payment within 24 hours, then your mentor sends the meeting link.
        </p>
      </div>
      <div className="border-t border-pz-border bg-pz-web-surface-low px-5 py-3.5 sm:px-6">
        <a
          href={whatsappLink(`Hi! I have a question about booking a session with ${mentor.name} on PZ Academy.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-2 font-poppins text-sm font-semibold text-pz-deep hover:underline"
        >
          <span className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-pz-mid" aria-hidden="true" />
            Questions? Ask us on WhatsApp
          </span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function SessionDetails({ mentor }: { mentor: Mentor }) {
  const rows: { icon: LucideIcon; label: string; value: string }[] = [
    { icon: Clock, label: "Session length", value: sessionLength(mentor) },
    { icon: Video, label: "Format", value: mentor.format },
    { icon: Globe, label: "Languages", value: mentor.language },
    { icon: CalendarClock, label: "Availability", value: mentor.availability },
    { icon: Timer, label: "Book ahead", value: mentor.leadTime },
    { icon: Clock, label: "Time zone", value: mentor.timezone },
  ].filter((r) => r.value.trim());
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="details-title" className={card}>
      <h2 id="details-title" className="mb-4 font-montserrat text-base font-bold text-pz-deep">Session details</h2>
      <dl className="space-y-3.5">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-pz-mid" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="font-poppins text-[11px] font-bold uppercase tracking-wider text-pz-muted">{label}</dt>
              <dd className="break-words font-poppins text-sm font-semibold text-pz-ink">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function MentorProfileClient({
  mentor,
  reviewSummary,
  reviews,
}: {
  mentor: Mentor;
  reviewSummary: MentorReviewSummary;
  reviews: MentorReview[];
}) {
  const field = mentorField(mentor);
  const from = priceFrom(mentor);
  const fee = mentor.pricePerSession > 0 ? mentor.pricePerSession : from;
  const rated = mentor.showReviews && reviewSummary.count > 0 && reviewSummary.avg != null;
  const bio = mentor.fullBio.filter((p) => p.trim());
  const about = bio.length > 0 ? bio : mentor.shortBio.trim() ? [mentor.shortBio] : [];
  const glance = [
    { icon: Briefcase, label: "Experience", value: mentor.experience },
    { icon: Languages, label: "Languages", value: mentor.language },
    { icon: Clock, label: "Session length", value: sessionLength(mentor) },
  ].filter((g) => g.value.trim());
  const hasConnect = Boolean(mentor.linkedinUrl) || mentor.socialLinks.length > 0;

  return (
    <div className="bg-pz-web-surface">
      {/* ── Hero ── */}
      <section
        aria-label={`${mentor.name} profile`}
        className="relative overflow-hidden rounded-b-[40px] bg-pz-solid-deep px-5 pb-12 pt-[6.5rem] text-white shadow-2xl md:px-6 md:pb-16 md:pt-[7.5rem]"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(126,217,87,0.18)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-pz-bright/15 blur-3xl" />

        <div className="relative mx-auto max-w-[1320px]">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex flex-wrap items-center gap-1.5 font-poppins text-xs text-white/70">
              <li><Link href="/" className="hover:text-white">Home</Link></li>
              <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
              <li><Link href="/mentorship" className="hover:text-white">All mentors</Link></li>
              <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
              <li aria-current="page" className="min-w-0 truncate font-semibold text-white">{mentor.name}</li>
            </ol>
          </nav>

          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="flex min-w-0 flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left lg:col-span-8">
              <div className="relative shrink-0">
                <div className="h-36 w-36 overflow-hidden rounded-full bg-pz-web-surface-high p-1 ring-4 ring-pz-bright/60 sm:h-44 sm:w-36 sm:rounded-3xl">
                  {mentor.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mentor.photo}
                      alt={`${mentor.name}, ${mentor.expertise || "mentor"} at PZ Academy`}
                      referrerPolicy="no-referrer"
                      className="h-full w-full rounded-full object-cover object-top sm:rounded-[20px]"
                    />
                  ) : (
                    <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-montserrat text-4xl font-black text-pz-mid">
                      {initials(mentor.name)}
                    </span>
                  )}
                </div>
                <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-pz-bright px-3 py-1 font-montserrat text-[11px] font-bold text-pz-solid-deep shadow-md">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Verified mentor
                </span>
              </div>

              <div className="min-w-0 pt-2">
                <div className="mb-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {field && (
                    <span className="max-w-full break-words rounded-full bg-white/10 px-3 py-1 font-poppins text-xs font-semibold text-white">{field}</span>
                  )}
                  <MentorTierBadge tier={mentor.tier} />
                </div>
                <h1 className="break-words font-montserrat text-[30px] font-black leading-tight tracking-[-0.02em] text-white sm:text-4xl lg:text-5xl">
                  {mentor.name}
                </h1>
                {mentor.title && <p className="mt-2 break-words font-poppins text-base font-medium text-pz-bright sm:text-lg">{mentor.title}</p>}

                <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {mentor.availability.trim() && (
                    <span className="inline-flex max-w-full items-start gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-left font-poppins text-xs text-white">
                      <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0 text-pz-bright" aria-hidden="true" />
                      <span className="min-w-0 break-words">Available: <strong className="font-semibold">{mentor.availability}</strong></span>
                    </span>
                  )}
                  {fee !== null && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 font-poppins text-xs text-white">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-pz-bright" aria-hidden="true" />
                      Fee: <strong className="font-semibold">{formatPrice(fee)}</strong> / session
                    </span>
                  )}
                  {rated && (
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 font-poppins text-xs text-white">
                      <StarRow avg={reviewSummary.avg!} size={13} />
                      <strong className="font-semibold">{reviewSummary.avg!.toFixed(1)}</strong>
                      ({reviewSummary.count} review{reviewSummary.count === 1 ? "" : "s"})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {glance.length > 0 && (
              <div className="min-w-0 rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur lg:col-span-4">
                <p className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">At a glance</p>
                <dl className="mt-3 grid grid-cols-1 gap-2.5">
                  {glance.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-3 rounded-2xl bg-pz-solid-deep/60 px-4 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-pz-bright" aria-hidden="true" />
                      <div className="min-w-0">
                        <dt className="font-poppins text-[11px] uppercase tracking-wider text-white/60">{label}</dt>
                        <dd className="break-words font-montserrat text-sm font-bold text-white">{value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-6 px-4 py-10 sm:px-5 md:px-6 md:py-14 lg:grid-cols-12 lg:gap-8">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {about.length > 0 && (
            <section aria-labelledby="about-title" className={card}>
              <SectionTitle id="about-title" icon={UserRound}>About {mentor.name}</SectionTitle>
              <div className="space-y-4 break-words font-poppins text-[15px] leading-relaxed text-pz-muted">
                {about.map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </section>
          )}

          {mentor.skills.length > 0 && (
            <section aria-labelledby="skills-title" className={card}>
              <SectionTitle id="skills-title" icon={Target}>Skills and focus areas</SectionTitle>
              <ul className="flex flex-wrap gap-2">
                {mentor.skills.map((s) => (
                  <li key={s} className="inline-flex max-w-full items-center gap-1.5 break-words rounded-full bg-pz-web-surface-low px-3.5 py-2 font-poppins text-[13px] font-medium text-pz-deep">
                    <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-pz-mid" aria-hidden="true" />
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mentor.credentials.length > 0 && (
            <section aria-labelledby="creds-title" className={card}>
              <SectionTitle id="creds-title" icon={Award}>Credentials</SectionTitle>
              <ul className="space-y-3">
                {mentor.credentials.map((c) => {
                  const Icon = credentialIcons[c.icon] ?? Award;
                  return (
                    <li key={`${c.title}-${c.institution}`} className="flex items-start gap-3 rounded-2xl bg-pz-web-surface-low p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pz-bright/25 text-pz-deep">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words font-montserrat text-sm font-bold text-pz-deep">{c.title}</p>
                        {c.institution && <p className="break-words font-poppins text-xs text-pz-muted">{c.institution}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {mentor.introVideoUrl && (
            <section aria-labelledby="video-title" className={card}>
              <SectionTitle id="video-title" icon={PlayCircle}>Intro video</SectionTitle>
              <div className="aspect-video w-full overflow-hidden rounded-2xl bg-pz-solid-deep">
                <iframe
                  src={toEmbedUrl(mentor.introVideoUrl)}
                  title={`${mentor.name} introduction`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </section>
          )}

          {mentor.showReviews && (
            <section aria-labelledby="reviews-title" className={card}>
              <MentorReviews summary={reviewSummary} reviews={reviews} showReviews={mentor.showReviews} />
            </section>
          )}

          {/* Admin-written quotes (Admin › Mentors › Testimonials), kept apart from real reviews above. */}
          {mentor.testimonials.length > 0 && (
            <section aria-labelledby="picks-title" className={card}>
              <SectionTitle id="picks-title" icon={Quote}>Editor&apos;s picks</SectionTitle>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {mentor.testimonials.map((t, i) => (
                  <figure key={i} className="rounded-2xl bg-pz-web-surface-low p-5">
                    <Quote className="mb-2 h-5 w-5 text-pz-mid/40" aria-hidden="true" />
                    <blockquote className="break-words font-poppins text-sm italic leading-relaxed text-pz-ink">{t.quote}</blockquote>
                    <figcaption className="mt-3 break-words font-montserrat text-xs font-bold text-pz-deep">
                      {t.author}
                      {t.role && <span className="font-poppins font-normal text-pz-muted"> · {t.role}</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {hasConnect && (
            <section aria-labelledby="connect-title" className={card}>
              <SectionTitle id="connect-title" icon={Link2}>Connect</SectionTitle>
              <div className="flex flex-wrap gap-2.5">
                {mentor.linkedinUrl && (
                  <a
                    href={mentor.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pz-border px-4 font-poppins text-sm font-medium text-pz-deep transition-colors hover:bg-pz-web-surface-low"
                  >
                    <LinkedInIcon size={15} className="text-pz-mid" />
                    LinkedIn
                  </a>
                )}
                {mentor.socialLinks.map((link) => {
                  const platform = detectSocialPlatform(link.url);
                  const Icon = platform ? BRAND_ICON_BY_PLATFORM[platform] : Globe;
                  return (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-pz-border px-4 font-poppins text-sm font-medium text-pz-deep transition-colors hover:bg-pz-web-surface-low"
                    >
                      <Icon size={15} className="text-pz-mid" />
                      {platform ? SOCIAL_PLATFORM_LABELS[platform] : link.label}
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          <section aria-labelledby="how-book-title" className={card}>
            <h2 id="how-book-title" className="mb-5 font-montserrat text-xl font-bold text-pz-deep md:text-2xl">How booking works</h2>
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {HOW_IT_WORKS.map(({ title, text }, i) => (
                <li key={title} className="flex gap-3 rounded-2xl bg-pz-web-surface-low p-4 sm:flex-col">
                  <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-montserrat text-sm font-black ${i === 0 ? "bg-pz-bright text-pz-solid-deep" : "bg-pz-solid-mid text-white"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-montserrat text-sm font-bold text-pz-deep">{title}</h3>
                    <p className="mt-1 font-poppins text-xs leading-relaxed text-pz-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="questions-title" className="flex flex-col items-start justify-between gap-5 rounded-[24px] bg-pz-solid-deep p-6 text-white sm:flex-row sm:items-center sm:p-8">
            <div className="min-w-0">
              <p className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">Help before you book</p>
              <h2 id="questions-title" className="mt-1 font-montserrat text-xl font-bold text-white">Have questions before booking?</h2>
              <p className="mt-1 font-poppins text-sm text-white/75">Message our team on WhatsApp about times, packages or payment.</p>
            </div>
            <a
              href={whatsappLink(`Hi! I'd like to discuss mentorship with ${mentor.name}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-pz-bright px-5 font-montserrat text-sm font-bold text-pz-solid-deep"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              WhatsApp us
            </a>
          </section>
        </div>

        <aside className="min-w-0 lg:col-span-4">
          <div className="space-y-6 lg:sticky lg:top-28">
            <BookingCard mentor={mentor} />
            <SessionDetails mentor={mentor} />
          </div>
        </aside>
      </div>

      {/* Phone: fee and book button always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-pz-border bg-pz-surface-container-lowest/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-poppins text-[11px] text-pz-muted">Fee</p>
            <p className="truncate font-montserrat text-base font-extrabold text-pz-deep">
              {fee === null ? "Ask for the fee" : <>{formatPrice(fee)} <span className="font-poppins text-xs font-normal text-pz-muted">/ session</span></>}
            </p>
          </div>
          <Link
            href={`/mentorship/book/${mentor.slug}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-pz-bright px-5 font-montserrat text-sm font-bold text-pz-solid-deep shadow-sm"
          >
            Book a session
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
