"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarCheck, Layers, Search, ShieldCheck, Video } from "lucide-react";
import type { Mentor } from "@/lib/data/mentors";
import type { MentorReviewSummary } from "@/lib/data/mentor-reviews";
import { initials } from "@/lib/format";
import { filterMentors, mentorFields, trustFacts } from "@/lib/mentorship/catalog";
import { partitionByFeaturedTier, shouldRenderFeaturedStrip } from "@/lib/mentor-tier";
import { PremiumMentorCard } from "./PremiumMentorCard";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Ring of real mentor photos beside the hero text (Stitch "1-on-1 Mentorship"). */
function PhotoRing({ mentors }: { mentors: Mentor[] }) {
  const faces = mentors.filter((m) => m.photo).slice(0, 5);
  if (faces.length === 0) return null;
  const [lead, ...others] = faces;
  const spots = ["left-2 top-2 sm:left-8", "right-2 top-6 sm:right-8", "bottom-6 left-4 sm:left-12", "bottom-8 right-6 sm:right-14"];
  return (
    <div aria-hidden="true" className="relative mx-auto hidden h-[400px] w-full max-w-[440px] items-center justify-center lg:flex">
      <div className="absolute h-[340px] w-[340px] rounded-full border border-white/10" />
      <div className="absolute h-[230px] w-[230px] animate-spin rounded-full border border-dashed border-pz-bright/30 [animation-duration:45s] motion-reduce:animate-none" />
      <div className="relative z-20 h-40 w-40 rounded-full bg-gradient-to-tr from-pz-bright to-pz-solid-mid p-1.5 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={lead.photo} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full bg-pz-web-surface-high object-cover object-top" />
        <span className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-white px-3 py-0.5 font-montserrat text-[11px] font-bold text-pz-solid-deep shadow-md">
          <BadgeCheck className="h-3.5 w-3.5 text-pz-mid" /> Verified mentor
        </span>
      </div>
      {others.map((m, i) => (
        <div key={m.slug} className={`absolute z-10 h-24 w-24 rounded-full bg-white/80 p-1 shadow-xl ring-2 ring-pz-bright/70 ${spots[i]}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.photo} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover object-top" />
        </div>
      ))}
      <div className="absolute -bottom-2 right-0 z-30 flex max-w-[230px] items-center gap-2.5 rounded-2xl border border-pz-border bg-white/95 p-2.5 shadow-xl">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pz-tertiary-fixed text-pz-on-tertiary-fixed"><Video className="h-5 w-5" /></span>
        <span>
          <span className="block font-montserrat text-xs font-bold leading-tight text-pz-ink">Private 1-on-1</span>
          <span className="block font-poppins text-[11px] text-pz-muted">On Google Meet or Zoom</span>
        </span>
      </div>
    </div>
  );
}

/** Small round faces for phones, where the ring does not fit. */
function FaceRow({ mentors }: { mentors: Mentor[] }) {
  const faces = mentors.slice(0, 5);
  if (faces.length === 0) return null;
  return (
    <div aria-hidden="true" className="mt-6 flex items-center gap-3 lg:hidden">
      <div className="flex -space-x-3">
        {faces.map((m) => (
          <span key={m.slug} className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border-2 border-pz-solid-deep bg-pz-solid-forest font-montserrat text-xs font-bold text-pz-bright">
            {m.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
            ) : (
              initials(m.name)
            )}
          </span>
        ))}
      </div>
      <span className="font-poppins text-sm text-white/80">Private 1-on-1 on Google Meet or Zoom</span>
    </div>
  );
}

export function MentorshipCatalog({ mentors, ratings }: { mentors: Mentor[]; ratings: Record<string, MentorReviewSummary> }) {
  const [query, setQuery] = useState("");
  const [field, setField] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);

  const fields = useMemo(() => mentorFields(mentors), [mentors]);
  const facts = useMemo(() => trustFacts(mentors, mentors.map((m) => ratings[m.id]?.count ?? 0)), [mentors, ratings]);
  const activeField = field !== null && fields.includes(field) ? field : null;
  const shown = useMemo(() => filterMentors(mentors, activeField, query), [mentors, activeField, query]);
  const filtering = activeField !== null || query.trim() !== "";
  const { featured, rest } = partitionByFeaturedTier(mentors);
  const showTop = !filtering && shouldRenderFeaturedStrip(featured.length, mentors.length);
  const goToList = () => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const fieldButton = (f: string | null, dark: boolean) => {
    const on = f === activeField;
    const look = dark
      ? on ? "bg-pz-bright font-semibold text-pz-solid-deep" : "bg-white/10 font-medium text-white hover:bg-white/20"
      : on ? "bg-pz-solid-deep font-semibold text-white" : "bg-pz-web-surface-low font-medium text-pz-deep hover:bg-pz-web-surface-high";
    return (
      <button
        key={`${dark ? "d" : "l"}-${f ?? "all"}`}
        type="button"
        aria-pressed={on}
        onClick={() => setField(f)}
        className={`min-h-11 max-w-full break-words rounded-full px-4 font-poppins text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-bright ${look}`}
      >
        {f ?? "All fields"}
      </button>
    );
  };

  const trust = [
    {
      icon: ShieldCheck,
      value: plural(facts.mentors, "verified mentor"),
      text: facts.reviews > 0 ? `Every profile checked by our team · ${plural(facts.reviews, "review")}` : "Every profile is checked by our team before it goes live.",
    },
    {
      icon: Layers,
      value: plural(facts.fields, "field"),
      text: fields.length > 0 ? fields.slice(0, 3).join(", ") + (fields.length > 3 ? " and more" : "") : "Pharmacy and health sciences",
    },
    { icon: CalendarCheck, value: "Checked within 24 hours", text: "Pay by bank transfer. Our team confirms your payment and your mentor sends the meeting link." },
  ];

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative w-full overflow-hidden rounded-b-[40px] bg-pz-solid-deep px-5 pb-20 pt-[7.5rem] text-white shadow-2xl md:px-6 md:pb-24 md:pt-[8.5rem]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(126,217,87,0.18)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-pz-bright/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-pz-bright" />
              <span className="font-poppins text-xs font-bold uppercase tracking-wider text-white">1-on-1 Mentorship</span>
            </div>
            <h1 className="break-words font-montserrat text-[34px] font-black leading-[1.1] tracking-[-0.025em] text-white sm:text-5xl lg:text-6xl">
              Find your <span className="text-pz-bright">mentor</span>
            </h1>
            <p className="mt-4 max-w-xl font-poppins text-base leading-relaxed text-white/80 sm:text-lg">
              Private 1-on-1 sessions with verified pharmacists and health experts. Pick a mentor, book a time, and get advice made for you.
            </p>

            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                goToList();
              }}
              className="mt-7 flex max-w-xl items-center gap-2 rounded-full bg-white p-1.5 shadow-2xl"
            >
              <Search className="ml-3 h-5 w-5 shrink-0 text-pz-mid" aria-hidden="true" />
              <input
                type="search"
                aria-label="Search mentors"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, field or skill"
                className="min-h-11 w-full min-w-0 bg-transparent font-poppins text-base text-pz-ink placeholder:text-pz-outline focus:outline-none"
              />
              <button type="submit" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-pz-bright px-5 font-montserrat text-sm font-bold text-pz-solid-deep shadow-md transition-transform hover:scale-[1.02]">
                Find <span className="hidden sm:inline">mentors</span> <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>

            {fields.length > 1 && (
              <div role="group" aria-label="Quick field" className="mt-4 hidden flex-wrap items-center gap-2 md:flex">
                {[null, ...fields.slice(0, 5)].map((f) => fieldButton(f, true))}
              </div>
            )}
            <FaceRow mentors={mentors} />
          </div>
          <div className="lg:col-span-5">
            <PhotoRing mentors={mentors} />
          </div>
        </div>
      </section>

      {/* ─── TRUST ─── */}
      <section aria-label="Why book with PZ Academy" className="relative z-10 mx-auto -mt-10 w-full max-w-[1320px] px-5 md:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
          {trust.map(({ icon: Icon, value, text }, i) => (
            <div key={i} className="flex items-center gap-5 rounded-2xl border border-pz-border bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(15,61,34,0.08)]">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${i === 2 ? "bg-pz-secondary-container text-pz-on-secondary-container" : "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed"}`}>
                <Icon className="h-7 w-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="break-words font-montserrat text-xl font-black text-pz-deep">{value}</p>
                <p className="mt-0.5 break-words font-poppins text-[13px] leading-snug text-pz-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── LIST ─── */}
      <section ref={listRef} id="mentors" aria-labelledby="mentors-title" className="w-full scroll-mt-24 px-5 pb-20 pt-14 md:px-6">
        <div className="mx-auto max-w-[1320px]">
          {mentors.length > 0 && (
            <div className="mb-10 flex flex-col gap-3 rounded-2xl border border-pz-border bg-pz-surface-container-lowest px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
              {fields.length > 1 ? (
                <div role="group" aria-label="Fields" className="flex min-w-0 flex-wrap gap-2">
                  {[null, ...fields].map((f) => fieldButton(f, false))}
                </div>
              ) : (
                <span />
              )}
              <p aria-live="polite" className="flex shrink-0 items-center gap-2 font-montserrat text-[15px] font-bold text-pz-deep">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-pz-solid-mid" />
                {plural(shown.length, "mentor")} available
              </p>
            </div>
          )}

          {showTop && (
            <div className="mb-14">
              <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-gold">Most requested</span>
              <h2 className="mt-1 font-montserrat text-[28px] font-black tracking-[-0.02em] text-pz-deep md:text-[34px]">Top mentors</h2>
              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                {featured.map((m) => (
                  <PremiumMentorCard key={m.slug} mentor={m} rating={ratings[m.id]} />
                ))}
              </div>
            </div>
          )}

          <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">Verified mentors</span>
          <h2 id="mentors-title" className="mt-1 font-montserrat text-[28px] font-black tracking-[-0.02em] text-pz-deep md:text-[34px]">
            {filtering ? "Matching mentors" : showTop ? "All mentors" : "Meet our mentors"}
          </h2>
          <p className="mt-1 font-poppins text-[15px] text-pz-muted">Each mentor is checked by our team. Open a profile to see their full background before you book.</p>

          {mentors.length === 0 ? (
            <p className="py-16 text-center font-poppins text-pz-muted">New mentors are joining soon. Please check back.</p>
          ) : shown.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-poppins text-pz-muted">No mentor matches that yet.</p>
              <button type="button" onClick={() => { setQuery(""); setField(null); }} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-pz-solid-forest px-6 font-poppins text-sm font-bold text-white">
                Show all mentors
              </button>
            </div>
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {(showTop ? rest : shown).map((m) => (
                <PremiumMentorCard key={m.slug} mentor={m} rating={ratings[m.id]} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
