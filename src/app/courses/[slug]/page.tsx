import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  GraduationCap,
  Infinity as InfinityIcon,
  Laptop,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { EnrollCta } from "@/components/courses/EnrollCta";
import { CurriculumAccordion } from "@/components/courses/CurriculumAccordion";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCourseBySlug, getCurriculum, getEnrollment } from "@/lib/data/lms";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { getActiveBanners } from "@/lib/data/marketing";
import { batchesNotListed, pickPromo } from "@/lib/marketing/promo";
import { stickyEnrollAction } from "@/lib/marketing/sticky-cta";
import { PromoSlot } from "@/components/marketing/PromoSlot";
import { StickyEnrollBar } from "@/components/courses/StickyEnrollBar";
import { LiveBatchBanner } from "@/components/marketing/LiveBatchBanner";
import { WebinarDateBanner } from "@/components/marketing/WebinarDateBanner";
import { seatsLeftText, startsAtLabel } from "@/lib/marketing/batch-facts";
import { courseCalendarEvent, googleCalendarUrl } from "@/lib/marketing/calendar";
import { isUpcomingWebinar } from "@/lib/marketing/webinar-time";
import { siteOrigin } from "@/lib/marketing/site-origin";
import { toEmbedUrl } from "@/lib/video-embed";
import { PROGRAM_COPY } from "@/lib/program-copy";
import { normalizeSections, sectionTitle, type SectionKey } from "@/lib/marketing/course-sections";

const WHATSAPP_URL = "https://wa.me/923700199429";

/** White rounded section card used down the left column (Stitch course page). */
const CARD = "rounded-3xl bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(15,61,34,0.05)] md:p-8";
const KICKER = "font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid";
/** Small green line above each main-column heading. */
const SECTION_KICKER: Record<SectionKey, string> = {
  about: "Overview",
  learn: "Skills you build",
  curriculum: "Step by step",
  teacher: "Your teacher",
  certificate: "On completion",
  faq: "Got questions?",
};
const H2 = "mt-1 break-words font-montserrat text-2xl font-extrabold tracking-[-0.02em] text-pz-deep md:text-[30px] md:leading-[38px]";

function initials(name: string): string {
  return name
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name, url, className }: { name: string; url: string | null; className: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-pz-solid-forest font-montserrat font-bold text-pz-bright ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course) return {};
  return {
    title: `${course.title} — PZ Academy`,
    description: course.tagline ?? course.description ?? undefined,
  };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = await getCourseBySlug(slug);
  if (!course || !course.isPublished) notFound();
  const copy = PROGRAM_COPY[course.type];

  const [modules, supabase, openBatches, midBanners] = await Promise.all([
    getCurriculum(course.id),
    createServerSupabase(),
    getOpenLiveBatches(),
    // The promo is optional: a failed read must never break the course page.
    getActiveBanners("mid_page").catch(() => []),
  ]);
  const liveBatch = openBatches.get(course.id) ?? null;
  const nowMs = Date.now();
  const webinarUpcoming = course.type === "webinar" && isUpcomingWebinar(course, nowMs);
  const webinarWhen = course.type === "webinar" && course.startsAt ? startsAtLabel(course.startsAt) : "";
  const calendarEvent = courseCalendarEvent({ course, batch: liveBatch, origin: siteOrigin(), nowMs, webinarUpcoming });
  const googleUrl = calendarEvent ? googleCalendarUrl(calendarEvent) : null;
  const calendar = googleUrl ? { google: googleUrl, ics: `/courses/${course.slug}/calendar.ics` } : null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const enrollment = user ? await getEnrollment(course.id, user.id) : null;
  const ctaStatus = !enrollment
    ? null
    : enrollment.status === "active" && !enrollment.portal_open
      ? "portal_closed"
      : enrollment.status;
  const barAction = stickyEnrollAction({ signedIn: Boolean(user), status: ctaStatus, slug: course.slug, ctaVerb: copy.ctaVerb });
  const price = course.pricePkr > 0 ? `PKR ${course.pricePkr.toLocaleString()}` : "Free";
  // Older rows or partial reads may lack these lists: treat missing as empty.
  const features = course.features ?? [];
  const outcomes = course.outcomes ?? [];
  const faqs = (course.faqs ?? []).filter((f) => f.question && f.answer);
  const facts = [
    webinarWhen && { icon: CalendarDays, label: "Date", value: webinarWhen },
    course.durationLabel && { icon: CalendarDays, label: "Duration", value: course.durationLabel },
    course.level && { icon: BarChart3, label: "Level", value: course.level },
    course.timings && { icon: Clock, label: "Timings", value: course.timings },
    copy.showCertificate && { icon: BadgeCheck, label: "Certificate", value: "On completion" },
  ].filter(Boolean) as { icon: LucideIcon; label: string; value: string }[];
  // On phones a long fact takes the full row; a short one left alone on its row does too.
  const isLong = (i: number) => facts[i].value.length > 16;
  const wideFact = (i: number) => {
    if (isLong(i)) return true;
    let shortBefore = 0;
    for (let j = 0; j < i; j++) if (!isLong(j)) shortBefore++;
    const nextShort = facts.slice(i + 1).some((_, k) => !isLong(i + 1 + k));
    return shortBefore % 2 === 0 && !nextShort;
  };
  const whatsapp = `${WHATSAPP_URL}?text=${encodeURIComponent(`Hi PZ Academy, I have a question about ${course.title}`)}`;
  const picture = course.bannerUrl ?? course.thumbnailUrl;
  // "Your next step": an admin Mid Page banner, else another course's open batch — never this course.
  const promo = pickPromo({
    banners: midBanners,
    batches: batchesNotListed(openBatches.values(), [course.id]),
    exclude: [`/courses/${course.slug}`, ...(liveBatch ? [liveBatch.href] : [])],
  });

  const typeLabel = copy.noun.charAt(0).toUpperCase() + copy.noun.slice(1);

  // What goes inside each main-column section. null = nothing to show, so the section is left out.
  const body: Record<SectionKey, ReactNode> = {
    about: course.description ? (
      <p className="mt-4 whitespace-pre-line break-words font-poppins text-[15px] leading-relaxed text-pz-muted md:text-base">{course.description}</p>
    ) : null,
    learn: outcomes.length > 0 ? (
      <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {outcomes.map((o, i) => (
          <li key={`${i}-${o}`} className="flex items-start gap-3 rounded-2xl bg-pz-web-surface-low p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pz-bright">
              <Check className="h-4 w-4 text-pz-solid-deep" aria-hidden="true" />
            </span>
            <span className="min-w-0 break-words font-poppins text-[15px] text-pz-ink">{o}</span>
          </li>
        ))}
      </ul>
    ) : null,
    curriculum: <CurriculumAccordion modules={modules} />,
    teacher: course.mentorName ? (
      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar name={course.mentorName} url={course.mentorAvatarUrl} className="h-28 w-28 rounded-3xl text-3xl" />
        <div className="min-w-0">
          <p className="break-words font-montserrat text-xl font-bold text-pz-deep">{course.mentorName}</p>
          {course.mentorTitle && <p className="break-words font-poppins text-sm font-semibold text-pz-mid">{course.mentorTitle}</p>}
          {course.mentorBio && <p className="mt-3 whitespace-pre-line break-words font-poppins text-[15px] leading-relaxed text-pz-muted">{course.mentorBio}</p>}
        </div>
      </div>
    ) : null,
    certificate: !copy.showCertificate ? null : course.certificateImageUrl ? (
      <>
        <p className="mt-2 font-poppins text-[15px] text-pz-muted">Finish the {copy.noun} and receive this certificate with your name.</p>
        <div className="mt-6 overflow-hidden rounded-3xl bg-pz-web-surface-low p-3 md:p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={course.certificateImageUrl}
            alt={`Certificate for ${course.title}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="mx-auto h-auto max-h-[560px] w-full rounded-2xl object-contain"
          />
        </div>
      </>
    ) : (
      <>
        <p className="mt-2 font-poppins text-[15px] text-pz-muted">Finish the {copy.noun} and receive a certificate with your name. This is a sample.</p>
        <div className="mt-6 rounded-3xl bg-pz-web-surface-low p-3 md:p-5">
          <div className="relative overflow-hidden rounded-2xl border-2 border-pz-solid-mid/30 bg-pz-surface-container-lowest px-5 py-8 text-center md:px-10 md:py-10">
            <GraduationCap aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 hidden h-40 w-40 text-pz-mid/10 md:block" />
            <p className="font-montserrat text-base font-extrabold text-pz-deep">PZ Academy</p>
            <p className="mt-1 font-poppins text-[11px] font-bold uppercase tracking-[0.15em] text-pz-muted">Certificate of completion</p>
            <p className="mt-5 font-poppins text-sm text-pz-muted">This is proudly awarded to</p>
            <p className="mx-auto mt-2 w-fit max-w-full border-b-2 border-pz-bright px-4 pb-1 font-montserrat text-2xl font-extrabold text-pz-deep md:text-3xl">Your name here</p>
            <p className="mx-auto mt-4 max-w-md break-words font-poppins text-sm text-pz-muted">
              for successfully completing <strong className="text-pz-deep">{course.title}</strong>
            </p>
            {course.mentorName && <p className="mt-6 break-words font-montserrat text-sm font-bold text-pz-deep">{course.mentorName}</p>}
          </div>
        </div>
      </>
    ),
    faq: faqs.length > 0 ? (
      <div className="mt-6">
        <FaqAccordion plainText onCard items={faqs.map((f) => ({ q: f.question, a: f.answer }))} />
      </div>
    ) : null,
  };
  const sections = normalizeSections(course.pageSections)
    .filter((sec) => sec.visible && body[sec.key] !== null)
    .map((sec) => ({ key: sec.key, title: sectionTitle(sec, course.type) }));

  return (
    <>
      <MarketingNav />

      <main className="bg-pz-web-surface">
        {/* ─── HERO ─── */}
        <section className="relative w-full overflow-hidden bg-pz-solid-deep px-5 pb-12 pt-[7.5rem] text-white md:px-6 md:pb-16 md:pt-[8.5rem]">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-1/4 h-96 w-96 rounded-full bg-pz-bright/15 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-pz-solid-mid/30 blur-3xl" />
          <div className="relative mx-auto max-w-[1320px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav aria-label="Breadcrumb" className="min-w-0 max-w-full">
                <ol className="flex min-w-0 items-center gap-1.5 font-poppins text-sm">
                  <li>
                    <Link href={copy.list.href} className="inline-flex min-h-11 items-center text-white/75 transition-colors hover:text-white">
                      {copy.list.label}
                    </Link>
                  </li>
                  <li aria-hidden="true"><ChevronRight className="h-4 w-4 text-white/50" /></li>
                  <li aria-current="page" className="min-w-0 max-w-full truncate font-semibold text-white">{course.title}</li>
                </ol>
              </nav>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-pz-solid-forest px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">{typeLabel}</span>
                {liveBatch && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pz-bright px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-solid-deep">
                    <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-pz-solid-mid" />
                    Live batch open
                  </span>
                )}
                {liveBatch?.seatsLeft != null && (
                  <span className="rounded-full bg-white px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-danger">
                    {seatsLeftText(liveBatch.seatsLeft)}
                  </span>
                )}
              </div>
            </div>

            <h1 className="mt-4 max-w-4xl break-words font-montserrat text-[28px] sm:text-[32px] font-extrabold leading-[1.15] tracking-[-0.025em] text-white md:text-[48px]">{course.title}</h1>
            {course.tagline && <p className="mt-4 max-w-2xl break-words font-poppins text-base leading-relaxed text-white/80 md:text-lg">{course.tagline}</p>}

            {course.mentorName && (
              <div className="mt-6 flex items-center gap-3">
                <Avatar name={course.mentorName} url={course.mentorAvatarUrl} className="h-12 w-12 border-2 border-pz-bright text-sm" />
                <div className="min-w-0">
                  <p className="break-words font-montserrat text-base font-bold text-white">{course.mentorName}</p>
                  {course.mentorTitle && <p className="break-words font-poppins text-sm text-white/70">{course.mentorTitle}</p>}
                </div>
              </div>
            )}

            {facts.length > 0 && (
              <dl className="mt-8 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
                {facts.map(({ icon: Icon, label, value }, i) => (
                  <div key={label} className={`${wideFact(i) ? "col-span-2 md:col-span-1" : ""} flex min-w-0 items-center gap-2.5 rounded-2xl bg-white/[0.06] p-3 sm:gap-3 sm:p-4`}>
                    <Icon className="h-5 w-5 shrink-0 text-pz-bright sm:h-6 sm:w-6" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="font-poppins text-[11px] font-bold uppercase tracking-wide text-white/60">{label}</dt>
                      <dd className="break-words font-montserrat text-sm font-bold leading-snug text-white">{value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-[1320px] px-5 py-10 md:px-6 md:py-14">
          {liveBatch && (
            <div className="mb-8">
              <LiveBatchBanner
                title={liveBatch.title}
                startsOn={liveBatch.startsOn}
                startsAtLabel={liveBatch.startsAtLabel}
                href={liveBatch.href}
                seatsLeft={liveBatch.seatsLeft}
                earlyBird={liveBatch.earlyBird}
                calendar={calendar}
              />
            </div>
          )}
          {!liveBatch && webinarUpcoming && webinarWhen && (
            <div className="mb-8">
              <WebinarDateBanner when={webinarWhen} calendar={calendar} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* ─── ENROLL BOX (first on phones, right column on computers) ─── */}
            <aside id="enroll" aria-label={`${typeLabel} fee and enrolment`} className="min-w-0 scroll-mt-24 lg:order-last lg:col-span-4">
              <div className="space-y-5 rounded-3xl bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.08)] lg:sticky lg:top-24">
                {/* Free public preview/recording video — no enrollment required to watch. See the
                    comment on courses.public_video_url: certificate/quiz/notes still require enrolling. */}
                {course.publicVideoUrl ? (
                  <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
                    <iframe
                      src={toEmbedUrl(course.publicVideoUrl)}
                      title={`${course.title} preview`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : picture ? (
                  <div className="aspect-video w-full overflow-hidden rounded-2xl bg-pz-web-surface-high">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  </div>
                ) : null}

                <div>
                  <p className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-muted">{copy.priceLabel}</p>
                  <p className="break-words font-montserrat text-[28px] font-extrabold leading-tight text-pz-deep sm:text-[32px]">{price}</p>
                </div>

                <EnrollCta signedIn={Boolean(user)} slug={course.slug} status={ctaStatus} ctaVerb={copy.ctaVerb} />

                {features.length > 0 && (
                  <div>
                    <h2 id="includes-title" className="mb-3 font-montserrat text-base font-bold text-pz-deep">This {copy.noun} includes</h2>
                    <ul aria-labelledby="includes-title" className="space-y-2.5">
                      {features.map((f, i) => (
                        <li key={`${i}-${f}`} className="flex items-start gap-2.5 font-poppins text-sm text-pz-ink">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-pz-mid" aria-hidden="true" />
                          <span className="min-w-0 break-words">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <ul className="space-y-3 border-t border-pz-border pt-4">
                  {copy.showCertificate && (
                    <li className="flex items-start gap-3">
                      <BadgeCheck className="h-5 w-5 shrink-0 text-pz-gold" aria-hidden="true" />
                      <div>
                        <p className="font-montserrat text-sm font-bold leading-tight text-pz-deep">SECP Accredited Certificate</p>
                        <p className="font-poppins text-xs text-pz-muted">Get a recognised credential on completion.</p>
                      </div>
                    </li>
                  )}
                  <li className="flex items-start gap-3">
                    <InfinityIcon className="h-5 w-5 shrink-0 text-pz-mid" aria-hidden="true" />
                    <div>
                      <p className="break-words font-montserrat text-sm font-bold leading-tight text-pz-deep">{copy.accessPerkTitle}</p>
                      <p className="font-poppins text-xs text-pz-muted">{copy.accessPerkDesc}</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <Laptop className="h-5 w-5 shrink-0 text-pz-mid" aria-hidden="true" />
                    <div>
                      <p className="font-montserrat text-sm font-bold leading-tight text-pz-deep">Access on all devices</p>
                      <p className="font-poppins text-xs text-pz-muted">Phone, tablet and computer friendly.</p>
                    </div>
                  </li>
                </ul>

                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-pz-web-surface-high px-5 py-3 font-montserrat text-sm font-bold text-pz-deep transition-colors hover:bg-pz-web-surface-low"
                >
                  <MessageCircle className="h-5 w-5 text-pz-mid" aria-hidden="true" />
                  Have questions? Ask on WhatsApp
                </a>
              </div>
            </aside>

            {/* ─── MAIN COLUMN: the admin's order, show/hide and headings (course editor → Public page) ─── */}
            <div className="min-w-0 space-y-8 lg:col-span-8">
              {sections.map(({ key, title }) => (
                <section key={key} data-course-section={key} aria-labelledby={`section-${key}`} className={CARD}>
                  <span className={KICKER}>{SECTION_KICKER[key]}</span>
                  {key === "curriculum" ? (
                    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
                      <h2 id={`section-${key}`} className={H2}>{title}</h2>
                      <p className="font-poppins text-sm font-medium text-pz-muted">
                        {modules.length} {copy.unitNoun}
                        {modules.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  ) : (
                    <h2 id={`section-${key}`} className={H2}>{title}</h2>
                  )}
                  {body[key]}
                </section>
              ))}
            </div>
          </div>
        </div>

        <PromoSlot promo={promo} />
      </main>

      <MarketingFooter />

      {barAction && (
        <>
          {/* Room under the footer so the fixed phone bar never covers it. */}
          <div aria-hidden="true" data-enroll-bar-spacer className="lg:hidden h-28" />
          <StickyEnrollBar priceLabel={copy.priceLabel} price={price} action={barAction} />
        </>
      )}
    </>
  );
}
