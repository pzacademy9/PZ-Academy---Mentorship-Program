import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  BookOpen,
  BarChart3,
  Calendar,
  Wallet,
  GraduationCap,
  Sparkles,
  BadgeCheck,
  Infinity as InfinityIcon,
  Laptop,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CurriculumAccordion } from "@/components/courses/CurriculumAccordion";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCourseBySlug, getCurriculum, getEnrollment } from "@/lib/data/lms";
import { toEmbedUrl } from "@/lib/video-embed";
import { PROGRAM_COPY } from "@/lib/program-copy";
import type { Database } from "@/lib/supabase/database.types";

const CTA_PRIMARY =
  "block text-center w-full bg-pz-primary text-pz-on-primary py-4 rounded-lg font-bold text-lg hover:bg-pz-on-primary-container active:scale-95 transition-all shadow-lg shadow-pz-primary/20 font-headline";
const CTA_DISABLED =
  "w-full bg-pz-surface-container-high text-pz-on-surface-variant py-4 rounded-lg font-bold text-lg cursor-not-allowed font-headline";
const CTA_HELPER = "text-xs text-pz-on-surface-variant text-center mt-2 font-body";

/**
 * The sidebar call-to-action. Extracted from the sticky card because it now
 * covers seven states; as an inline ternary chain it was unreadable.
 *
 * The switch is exhaustive over enrollment_status by design — the annotated
 * return type makes a missing case a compile error rather than a blank CTA.
 */
function EnrollCta({
  signedIn,
  slug,
  status,
  ctaVerb,
}: {
  signedIn: boolean;
  slug: string;
  status: Database["public"]["Enums"]["enrollment_status"] | null;
  ctaVerb: "Enroll" | "Register";
}): React.ReactElement {
  if (!signedIn) {
    return (
      <Link href={`/login?returnUrl=/courses/${slug}`} className={CTA_PRIMARY}>
        Log In to {ctaVerb}
      </Link>
    );
  }
  if (!status) {
    return (
      <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
        {ctaVerb} Now
      </Link>
    );
  }

  switch (status) {
    case "active":
      return (
        <Link
          href={`/portal/${slug}`}
          className={`${CTA_PRIMARY} flex items-center justify-center gap-2`}
        >
          <BookOpen className="w-5 h-5" /> Continue Learning
        </Link>
      );
    case "pending":
      return (
        <div>
          <button disabled className={CTA_DISABLED}>
            Awaiting Verification
          </button>
          <p className={CTA_HELPER}>We&apos;ll email you once your payment is verified.</p>
        </div>
      );
    case "reserved":
      return (
        <div>
          <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
            Complete Payment
          </Link>
          <p className={CTA_HELPER}>
            Your seat is reserved. The course unlocks once payment is confirmed.
          </p>
        </div>
      );
    case "rejected":
      return (
        <div>
          <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
            Submit New Payment
          </Link>
          <p className={CTA_HELPER}>
            Your last submission wasn&apos;t approved — check your email for the reason.
          </p>
        </div>
      );
    case "expired":
      return (
        <div>
          <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
            {ctaVerb} Again
          </Link>
          <p className={CTA_HELPER}>Your previous enrollment has expired.</p>
        </div>
      );
  }
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

  const [modules, supabase] = await Promise.all([getCurriculum(course.id), createServerSupabase()]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const enrollment = user ? await getEnrollment(course.id, user.id) : null;

  return (
    <>
      <MarketingNav />

      <main className="max-w-[1280px] mx-auto px-6 md:px-16 py-8">
        {/* Hero */}
        <section className="mb-12">
          <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden mb-8 shadow-xl bg-gradient-to-br from-pz-deep to-pz-forest">
            {course.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={course.bannerUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-8 left-8 right-8">
              {course.level && (
                <span className="inline-block bg-pz-primary-container text-pz-on-primary-container px-3 py-1 rounded-full text-sm font-bold tracking-wider mb-4 uppercase">
                  {course.level}
                </span>
              )}
              <h1 className="text-white text-3xl md:text-5xl font-black font-headline mb-3">
                {course.title}
              </h1>
              {course.tagline && (
                <p className="text-white/90 text-lg md:text-xl max-w-3xl font-body">
                  {course.tagline}
                </p>
              )}
            </div>
          </div>

          {course.mentorName && (
            <div className="flex items-center gap-4 p-4 bg-pz-surface-container-lowest rounded-lg shadow-sm border border-pz-outline-variant/30">
              <div className="w-16 h-16 shrink-0 rounded-full overflow-hidden border-2 border-pz-primary bg-pz-primary/10 flex items-center justify-center">
                {course.mentorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.mentorAvatarUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-headline font-bold text-pz-primary text-xl">
                    {course.mentorName.charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <p className="text-pz-on-surface font-bold text-lg font-headline">
                  {course.mentorName}
                </p>
                {course.mentorTitle && (
                  <p className="text-pz-on-surface-variant text-sm font-body">{course.mentorTitle}</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Free public preview/recording video — no enrollment required to watch. See the
            comment on courses.public_video_url: certificate/quiz/notes still require enrolling. */}
        {course.publicVideoUrl && (
          <section className="mb-12">
            <div className="aspect-video w-full rounded-xl overflow-hidden shadow-xl bg-black">
              <iframe
                src={toEmbedUrl(course.publicVideoUrl)}
                title={course.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-12">
            {/* Meta row */}
            <div className="flex flex-wrap gap-4">
              {course.level && (
                <div className="flex items-center gap-3 bg-pz-surface-container-low px-6 py-4 rounded-xl flex-1 min-w-[150px]">
                  <BarChart3 className="w-5 h-5 text-pz-primary shrink-0" />
                  <div>
                    <p className="text-xs text-pz-on-surface-variant font-medium font-body">Difficulty</p>
                    <p className="font-bold text-pz-deep font-headline">{course.level}</p>
                  </div>
                </div>
              )}
              {course.durationLabel && (
                <div className="flex items-center gap-3 bg-pz-surface-container-low px-6 py-4 rounded-xl flex-1 min-w-[150px]">
                  <Calendar className="w-5 h-5 text-pz-primary shrink-0" />
                  <div>
                    <p className="text-xs text-pz-on-surface-variant font-medium font-body">Duration</p>
                    <p className="font-bold text-pz-deep font-headline">{course.durationLabel}</p>
                  </div>
                </div>
              )}
              {course.timings && (
                <div className="flex items-center gap-3 bg-pz-surface-container-low px-6 py-4 rounded-xl flex-1 min-w-[150px]">
                  <Calendar className="w-5 h-5 text-pz-primary shrink-0" />
                  <div>
                    <p className="text-xs text-pz-on-surface-variant font-medium font-body">Timings</p>
                    <p className="font-bold text-pz-deep font-headline">{course.timings}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 bg-pz-surface-container-low px-6 py-4 rounded-xl flex-1 min-w-[150px]">
                <Wallet className="w-5 h-5 text-pz-primary shrink-0" />
                <div>
                  <p className="text-xs text-pz-on-surface-variant font-medium font-body">{copy.priceLabel}</p>
                  <p className="font-bold text-pz-deep font-headline">
                    PKR {course.pricePkr.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* What You'll Learn */}
            {course.outcomes.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-pz-deep font-headline mb-6 flex items-center gap-2">
                  <GraduationCap className="w-6 h-6 text-pz-primary" />
                  What You&apos;ll Learn
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {course.outcomes.map((outcome) => (
                    <div
                      key={outcome}
                      className="p-6 bg-pz-surface-container-lowest border border-pz-outline-variant/30 rounded-xl hover:shadow-md transition-shadow"
                    >
                      <Sparkles className="w-6 h-6 text-pz-primary mb-3" />
                      <p className="font-body text-pz-on-surface-variant text-sm">{outcome}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Curriculum */}
            <section>
              <div className="flex justify-between items-end mb-6">
                <h2 className="text-2xl font-bold text-pz-deep font-headline flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-pz-primary" />
                  {copy.curriculumHeading}
                </h2>
                <p className="text-pz-on-surface-variant text-sm font-medium font-body">
                  {modules.length} {copy.unitNoun}
                  {modules.length === 1 ? "" : "s"}
                </p>
              </div>
              <CurriculumAccordion modules={modules} />
            </section>
          </div>

          {/* Right column: sticky sidebar */}
          <aside className="lg:col-span-4">
            <div className="sticky top-20 bg-pz-surface-container-lowest border-2 border-pz-primary/20 rounded-2xl p-6 shadow-xl space-y-6">
              <div>
                <p className="text-pz-on-surface-variant font-medium font-body mb-1">
                  Full Course Access
                </p>
                <h3 className="text-3xl font-black text-pz-deep font-headline">
                  PKR {course.pricePkr.toLocaleString()}
                </h3>
              </div>

              <EnrollCta
                signedIn={Boolean(user)}
                slug={course.slug}
                status={enrollment?.status ?? null}
                ctaVerb={copy.ctaVerb}
              />

              <div className="space-y-4 pt-4 border-t border-pz-outline-variant/30">
                {copy.showCertificate && (
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="w-5 h-5 shrink-0 text-pz-gold" />
                    <div>
                      <p className="text-sm font-bold text-pz-deep leading-tight font-headline">
                        SECP Accredited Certificate
                      </p>
                      <p className="text-xs text-pz-on-surface-variant font-body">
                        Get a globally recognized credential upon completion.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <InfinityIcon className="w-5 h-5 shrink-0 text-pz-primary" />
                  <div>
                    <p className="text-sm font-bold text-pz-deep leading-tight font-headline">
                      {copy.accessPerkTitle}
                    </p>
                    <p className="text-xs text-pz-on-surface-variant font-body">{copy.accessPerkDesc}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Laptop className="w-5 h-5 shrink-0 text-pz-primary" />
                  <div>
                    <p className="text-sm font-bold text-pz-deep leading-tight font-headline">
                      Access on all Devices
                    </p>
                    <p className="text-xs text-pz-on-surface-variant font-body">
                      Mobile, tablet, and desktop friendly.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <MarketingFooter />
    </>
  );
}
