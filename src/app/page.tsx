import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { BookOpen, Video, Wrench, UserCheck, ArrowRight, Clock, Award, Quote, MessageCircle, BadgeCheck } from "lucide-react";
import { getActiveBanners, getFeaturedItems, type FeaturedCard } from "@/lib/data/marketing";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { getPublishedCourses } from "@/lib/data/lms";
import { getPublishedMentors } from "@/lib/data/mentors";
import { OpenBatchStrip } from "@/components/marketing/OpenBatchStrip";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PromoSlot } from "@/components/marketing/PromoSlot";
import { CourseCard } from "@/components/marketing/CourseCard";
import { HeroCollage } from "@/components/marketing/home/HeroCollage";
import { QuickQuiz } from "@/components/marketing/home/QuickQuiz";
import { MentorStrip, type StripMentor } from "@/components/marketing/home/MentorStrip";
import { SectionHeader } from "@/components/marketing/kit/SectionHeader";
import { StatCounter } from "@/components/marketing/kit/StatCounter";
import { BTN_GHOST_DARK, BTN_PRIMARY, BTN_SOLID } from "@/components/marketing/kit/buttons";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";
import { isSafeHref, pickPromo } from "@/lib/marketing/promo";
import { QUICK_QUIZ } from "@/lib/marketing/quick-quiz";

const DOTS_BG = "radial-gradient(circle at 2px 2px, rgba(126,217,87,.16) 1.4px, transparent 0)";

const STATS = [
  { icon: Video,    number: "12+",  label: "Live Webinars" },
  { icon: BookOpen, number: "2+",   label: "Active Courses" },
  { icon: Wrench,   number: "3+",   label: "Workshops" },
  { icon: Award,    number: "SECP", label: "Certified Program" },
];

// The ladder: cheapest / easiest first, then step up. Order matters — it is the
// path the home page guides every visitor along.
const SERVICES = [
  { icon: Video,    step: "Start free",    title: "Webinars",   cta: "Watch free webinars", href: "/webinars",          tag: "Free",
    desc: "Live expert-led sessions on modern medicines, pharma practice and industry trends." },
  { icon: Wrench,   step: "Build a skill", title: "Workshops",  cta: "View Workshops",      href: "/workshops",         tag: null,
    desc: "Short, hands-on workshops that turn ideas into skills you can use the next day." },
  { icon: BookOpen, step: "Get certified", title: "Courses",    cta: "Explore Courses",     href: "/courses",           tag: "Certificate",
    desc: "Structured modules in pharmacology, drug mechanisms and clinical practice." },
  { icon: UserCheck,step: "1-on-1 help",   title: "Mentorship", cta: "Find a Mentor",       href: "/mentorship#mentors", tag: null,
    desc: "Private sessions with experts who guide your studies, career and research." },
];

const REVIEWS = [
  { text: "Passed my pharmacology board exam on the first attempt. The dose calc course is brilliant.", author: "Sara A.", role: "Pharm.D Student", initials: "SA" },
  { text: "MED-Q tournaments kept me motivated every week. Best pharma community in Pakistan.",         author: "M. Kamran", role: "Final Year Student", initials: "MK" },
];

/** An admin-picked Featured item (see /dashboard/admin/marketing), shown as a program card. */
function FeaturedProgramCard({ item }: { item: FeaturedCard }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-pz-border bg-pz-surface-container-lowest transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-lg">
      <div aria-hidden="true" className="relative flex h-28 items-center justify-center bg-gradient-to-br from-pz-solid-deep to-pz-solid-mid" style={{ backgroundImage: DOTS_BG, backgroundSize: "22px 22px" }}>
        <BookOpen className="h-10 w-10 text-pz-bright/70" strokeWidth={1.5} />
      </div>
      <div className="flex flex-1 flex-col p-6">
        <span className="mb-3 self-start rounded-full bg-pz-bright/15 px-3 py-1 font-fredoka text-xs font-semibold text-pz-mid">{item.badge}</span>
        <h3 className="mb-2 font-montserrat text-lg font-bold text-pz-deep group-hover:text-pz-mid">{item.title}</h3>
        {item.desc && <p className="line-clamp-3 font-poppins text-sm leading-relaxed text-pz-muted">{item.desc}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          {item.duration ? (
            <span className="flex items-center gap-1 font-poppins text-xs text-pz-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {item.duration}</span>
          ) : <span />}
          <Link href={item.href} className="inline-flex min-h-11 items-center gap-1.5 font-poppins text-sm font-bold text-pz-mid transition-all hover:gap-2.5">
            View details <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default async function HomePage() {
  const [heroBanners, midBanners, featuredCards, openBatches, published, mentorRows] = await Promise.all([
    getActiveBanners("hero"),
    getActiveBanners("mid_page"),
    getFeaturedItems(),
    getOpenLiveBatches(),
    // Optional extras: a failed read must never break the home page.
    getPublishedCourses().catch(() => []),
    getPublishedMentors().catch(() => []),
  ]);
  const mentors: StripMentor[] = mentorRows;
  // Open batches already have their own strip on this page, so the mid-page
  // promo only shows an admin banner (no duplicate batch box).
  const midPromo = pickPromo({ banners: midBanners, batches: [] });
  const heroBanner = heroBanners[0] ?? null;
  const heroCta = heroBanner && isSafeHref(heroBanner.ctaLink) ? heroBanner : null;
  const batchList = Array.from(openBatches.values());
  // Admin-picked featured items win; otherwise show real courses and workshops.
  const programs = featuredCards.length > 0
    ? null
    : attachLiveBatches(published.filter((c) => c.type === "course" || c.type === "workshop"), openBatches).slice(0, 3);
  const hasPrograms = featuredCards.length > 0 || (programs?.length ?? 0) > 0;
  const faces = mentors.filter((m) => m.photo).slice(0, 3);

  return (
    <>
      <MarketingNav />
      <main>

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-pz-solid-deep">
        {/* Banner image, when an active hero banner is set — see /dashboard/admin/marketing */}
        {heroBanner?.imageUrl && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroBanner.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-b from-pz-solid-deep/70 via-pz-solid-deep/80 to-pz-solid-deep" />
          </div>
        )}
        <div aria-hidden="true" className="absolute inset-0 opacity-60" style={{ backgroundImage: DOTS_BG, backgroundSize: "28px 28px" }} />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-40 h-[560px] w-[560px] rounded-full bg-pz-bright opacity-[.09] blur-[100px] animate-[orbFloat1_12s_ease-in-out_infinite]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 h-[420px] w-[420px] rounded-full bg-pz-solid-mid opacity-30 blur-[100px] animate-[orbFloat2_15s_ease-in-out_infinite]" />

        <div className="relative mx-auto grid max-w-[1180px] items-center gap-14 px-6 pb-24 pt-28 md:pt-32 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pb-32 lg:pt-36">
          <div className="text-center lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-pz-bright/30 bg-pz-bright/10 px-4 py-1.5 font-fredoka text-xs font-semibold uppercase tracking-[.14em] text-pz-bright">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-pz-bright" />
              Educating with Innovation
            </div>
            <h1 className="font-montserrat font-black leading-[1.05] tracking-[-0.025em] text-white" style={{ fontSize: "clamp(2.1rem,5.4vw,4.1rem)" }}>
              {heroBanner ? heroBanner.headline : (
                <>Empowering Minds{" "}<span className="relative inline-block text-pz-bright">To Master The Science<svg aria-hidden="true" viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full"><path d="M2 9 C 50 2, 150 2, 198 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".55" /></svg></span>{" "}Of Medicine</>
              )}
            </h1>
            <p className="mx-auto mt-6 max-w-[540px] font-poppins leading-relaxed text-white/70 lg:mx-0" style={{ fontSize: "clamp(.98rem,1.5vw,1.1rem)" }}>
              PZ Academy by Pharmacozyme — live webinars, hands-on workshops, certified courses and 1-on-1 mentors for pharmacy and health sciences students.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3.5 lg:justify-start">
              {heroCta ? (
                <Link href={heroCta.ctaLink} className={BTN_PRIMARY}>
                  <BookOpen className="h-4 w-4" aria-hidden="true" /> {heroCta.ctaText}
                </Link>
              ) : (
                <Link href="#paths" className={BTN_PRIMARY}>
                  Find your program <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
              <Link href="/webinars" className={BTN_GHOST_DARK}>
                <Video className="h-4 w-4" aria-hidden="true" /> Free webinars
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 lg:justify-start">
              {faces.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-3">
                    {faces.map((m) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={m.id} src={m.photo} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full border-2 border-pz-solid-deep object-cover object-top" />
                    ))}
                  </div>
                  <span className="font-poppins text-sm text-white/70">Taught by practising experts</span>
                </div>
              )}
              <span className="inline-flex items-center gap-1.5 font-poppins text-sm text-white/70">
                <BadgeCheck className="h-4 w-4 text-pz-bright" aria-hidden="true" /> SECP certified program
              </span>
            </div>
          </div>

          <HeroCollage batch={batchList[0] ?? null} />
        </div>
      </section>

      {/* ─── NUMBERS (overlaps the hero) ─────────────────────────────────── */}
      <section aria-label="PZ Academy in numbers" className="relative z-10 -mt-12 px-6">
        <ul className="mx-auto grid max-w-[1060px] grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-pz-border bg-pz-border shadow-card-lg md:grid-cols-4">
          {STATS.map((s) => (
            <li key={s.label} className="flex items-center gap-3.5 bg-pz-surface-container-lowest px-5 py-6 md:justify-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pz-bright/15">
                <s.icon className="h-5 w-5 text-pz-mid" aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="font-montserrat text-2xl font-extrabold leading-none text-pz-deep"><StatCounter value={s.number} /></span>
                <span className="mt-1 font-poppins text-xs font-medium text-pz-muted">{s.label}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── CHOOSE YOUR PATH ─────────────────────────────────────────────── */}
      <section id="paths" aria-labelledby="paths-title" className="scroll-mt-20 bg-pz-offwhite px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeader
            kicker="Find your program"
            kickerId="paths-title"
            title={<>Start free, then <em className="not-italic text-pz-mid">level up</em></>}
            text="Four steps, one path. Begin with a free webinar and grow all the way to 1-on-1 mentorship."
          />
          <div className="relative">
            <div aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-[3px] rounded-full bg-gradient-to-r from-pz-bright via-pz-solid-mid to-pz-gold lg:block" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map((s, i) => (
                <Link key={s.title} href={s.href}
                  className="group relative flex flex-col rounded-3xl border border-pz-border bg-pz-surface-container-lowest p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-pz-solid-mid/50 hover:shadow-card-lg">
                  <div className="relative mb-5 flex items-center justify-between">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pz-solid-deep to-pz-solid-mid shadow-card transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                      <s.icon className="h-6 w-6 text-pz-bright" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span aria-hidden="true" className="font-montserrat text-4xl font-black text-pz-border">0{i + 1}</span>
                  </div>
                  <span className="mb-1 font-fredoka text-xs font-semibold uppercase tracking-[.1em] text-pz-mid">{s.step}</span>
                  <h3 className="mb-2 flex items-center gap-2 font-montserrat text-xl font-bold text-pz-deep">
                    {s.title}
                    {s.tag && <span className="rounded-full bg-pz-bright/20 px-2.5 py-0.5 font-fredoka text-[.7rem] font-semibold text-pz-mid">{s.tag}</span>}
                  </h3>
                  <p className="flex-1 font-poppins text-sm leading-relaxed text-pz-muted">{s.desc}</p>
                  <span className="mt-5 flex items-center gap-1.5 font-poppins text-sm font-bold text-pz-deep transition-all duration-200 group-hover:gap-3 group-hover:text-pz-mid">
                    {s.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <OpenBatchStrip batches={batchList} />

      {/* ─── POPULAR PROGRAMS ─────────────────────────────────────────────── */}
      {hasPrograms && (
        <section aria-labelledby="home-programs" className="bg-pz-offwhite px-6 py-20 md:py-24">
          <div className="mx-auto max-w-[1120px]">
            <SectionHeader
              kicker="Enrolling now"
              title={<>Popular <em className="not-italic text-pz-mid">programs</em></>}
              titleId="home-programs"
              text="Clinically relevant, expert-led and built for real exams and real jobs."
            />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {programs
                ? programs.map((c) => <CourseCard key={c.id} course={c} />)
                : featuredCards.map((f) => <FeaturedProgramCard key={f.href + f.title} item={f} />)}
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/courses" className={BTN_SOLID}>
                See all courses <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── QUICK QUIZ ───────────────────────────────────────────────────── */}
      <section aria-labelledby="home-quiz" className="relative overflow-hidden bg-pz-surface-container-lowest px-6 py-20 md:py-28">
        <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: DOTS_BG, backgroundSize: "26px 26px" }} />
        <div className="relative mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeader
              kicker="Test yourself"
              title={<>Quick quiz: <em className="not-italic text-pz-mid">how sharp are you?</em></>}
              titleId="home-quiz"
              text="Four exam-style questions, instant answers. This is how our classes feel — short, clear and a little bit competitive."
              align="left"
            />
            <div className="-mt-4 flex flex-wrap gap-3">
              <Link href="/webinars" className={BTN_SOLID}>
                <Video className="h-4 w-4" aria-hidden="true" /> Learn it in a free webinar
              </Link>
            </div>
          </div>
          <QuickQuiz questions={QUICK_QUIZ} />
        </div>
      </section>

      <MentorStrip mentors={mentors} />

      {/* ─── REVIEWS ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="home-reviews" className="bg-pz-offwhite px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[1060px]">
          <SectionHeader kicker="Student stories" title="What students say" titleId="home-reviews" />
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {REVIEWS.map((r) => (
              <li key={r.initials} className="relative overflow-hidden rounded-3xl border border-pz-border bg-pz-surface-container-lowest p-7 md:p-8">
                <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pz-solid-forest to-pz-bright" />
                {/* No star rating: there are no verified public ratings yet. */}
                <Quote className="mb-4 h-8 w-8 text-pz-bright" aria-hidden="true" />
                <p className="mb-6 font-poppins text-lg leading-relaxed text-pz-ink">&ldquo;{r.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pz-bright to-pz-solid-mid font-montserrat text-sm font-bold text-white">{r.initials}</div>
                  <div className="flex flex-col">
                    <span className="font-montserrat text-sm font-bold text-pz-deep">{r.author}</span>
                    <span className="font-poppins text-xs text-pz-muted">{r.role}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PromoSlot promo={midPromo} />

      {/* ─── CTA ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-pz-solid-deep px-6 py-24">
        <div aria-hidden="true" className="absolute inset-0 opacity-70" style={{ backgroundImage: DOTS_BG, backgroundSize: "28px 28px" }} />
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pz-bright opacity-10 blur-[110px]" />
        <div className="relative z-10 mx-auto max-w-[680px] text-center">
          <span className="mb-4 block font-fredoka text-xs font-semibold uppercase tracking-[.14em] text-pz-bright">
            Ready to elevate your career?
          </span>
          <h2 className="mb-5 font-montserrat font-black leading-tight tracking-[-0.02em] text-white" style={{ fontSize: "clamp(1.8rem,3.5vw,2.8rem)" }}>
            Build the expertise that<br /><span className="text-pz-bright">transforms careers</span>
          </h2>
          <p className="mx-auto mb-10 max-w-[480px] font-poppins leading-relaxed text-white/70">
            Learn with pharmacy and health sciences students across Pakistan, the UAE and KSA — evidence-based, expert-led, results-driven.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="#paths" className={BTN_PRIMARY}>
              Find your program <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="https://wa.me/923700199429" target="_blank" rel="noopener noreferrer" className={BTN_GHOST_DARK}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Ask us on WhatsApp
            </Link>
          </div>
        </div>
      </section>

      </main>
      <MarketingFooter />
    </>
  );
}
