import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import {
  ArrowRight, BadgeCheck, BookOpen, Clock, GraduationCap, MessageCircle, MonitorPlay, Award, ShieldCheck, Sparkles, UserCheck, Wrench,
} from "lucide-react";
import { getActiveBanners, getFeaturedItems, type FeaturedCard } from "@/lib/data/marketing";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { getPublishedCourses } from "@/lib/data/lms";
import { getPublishedMentors } from "@/lib/data/mentors";
import { OpenBatchStrip } from "@/components/marketing/OpenBatchStrip";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PromoSlot } from "@/components/marketing/PromoSlot";
import { CourseCard } from "@/components/marketing/CourseCard";
import { QuickQuiz } from "@/components/marketing/home/QuickQuiz";
import { MentorStrip, type StripMentor } from "@/components/marketing/home/MentorStrip";
import { SectionHeader } from "@/components/marketing/kit/SectionHeader";
import { StatCounter } from "@/components/marketing/kit/StatCounter";
import { BTN_GHOST_DARK, BTN_PRIMARY, BTN_SOLID } from "@/components/marketing/kit/buttons";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";
import { isSafeHref, pickPromo } from "@/lib/marketing/promo";
import { QUICK_QUIZ } from "@/lib/marketing/quick-quiz";

const CARD_SHADOW = "shadow-[0_8px_30px_rgba(15,61,34,0.05)]";
const LATTICE_BG = "radial-gradient(circle at 2px 2px, rgba(255,255,255,.9) 1.2px, transparent 0)";

const STATS = [
  { number: "12+",  label: "Live webinars" },
  { number: "2+",   label: "Active courses" },
  { number: "3+",   label: "Hands-on workshops" },
  { number: "SECP", label: "Certified program" },
];

// The ladder: cheapest / easiest first, then step up. Order matters — it is the
// path the home page guides every visitor along.
const SERVICES = [
  { icon: MonitorPlay,  step: "Start free",    title: "Webinars",   cta: "Explore webinars", href: "/webinars",
    tag: "Free",        tagClass: "bg-pz-bright/40 text-pz-solid-deep",
    desc: "Live expert-led sessions on modern medicines, pharma practice and industry trends." },
  { icon: Wrench,       step: "Build a skill", title: "Workshops",  cta: "Browse workshops", href: "/workshops",
    tag: "Practical",   tagClass: "bg-pz-web-surface-high text-pz-deep",
    desc: "Short, hands-on workshops that turn ideas into skills you can use the next day." },
  { icon: GraduationCap, step: "Get certified", title: "Courses",   cta: "View courses",     href: "/courses",
    tag: "Certificate", tagClass: "bg-pz-gold/20 text-pz-gold",
    desc: "Structured modules in pharmacology, drug mechanisms and clinical practice." },
  { icon: UserCheck,    step: "1-on-1 help",   title: "Mentorship", cta: "Find a mentor",    href: "/mentorship#mentors",
    tag: "1-on-1",      tagClass: "bg-pz-solid-deep text-white",
    desc: "Private sessions with experts who guide your studies, career and research." },
];

const REVIEWS = [
  { text: "Passed my pharmacology board exam on the first attempt. The dose calc course is brilliant.", author: "Sara A.", role: "Pharm.D Student", initials: "SA", avatar: "bg-pz-solid-forest text-pz-bright" },
  { text: "MED-Q tournaments kept me motivated every week. Best pharma community in Pakistan.",         author: "M. Kamran", role: "Final Year Student", initials: "MK", avatar: "bg-pz-solid-mid text-white" },
];

/** An admin-picked Featured item (see /dashboard/admin/marketing), shown as a program card. */
function FeaturedProgramCard({ item }: { item: FeaturedCard }) {
  return (
    <article className={`flex h-full flex-col justify-between gap-5 rounded-[24px] bg-pz-surface-container-lowest p-5 md:p-6 ${CARD_SHADOW}`}>
      <div className="flex flex-col gap-4">
        <div aria-hidden="true" className="flex aspect-[16/10] w-full items-center justify-center rounded-[16px] bg-pz-web-surface-high">
          <BookOpen className="h-10 w-10 text-pz-mid/50" strokeWidth={1.5} />
        </div>
        <span className="self-start rounded-full bg-pz-web-surface-high px-3 py-1 font-poppins text-xs font-bold text-pz-deep">{item.badge}</span>
        <h3 className="font-montserrat text-xl font-bold leading-tight text-pz-deep md:text-2xl">{item.title}</h3>
        {item.desc && <p className="-mt-2 line-clamp-3 font-poppins text-sm leading-relaxed text-pz-muted">{item.desc}</p>}
      </div>
      <div className="flex items-center justify-between gap-3">
        {item.duration ? (
          <span className="flex items-center gap-1 font-poppins text-xs text-pz-muted"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {item.duration}</span>
        ) : <span />}
        <Link href={item.href} className="inline-flex min-h-11 items-center justify-center rounded-full bg-pz-solid-deep px-5 font-montserrat text-[15px] font-bold text-white transition-colors hover:bg-pz-solid-forest">
          View details
        </Link>
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
  // Open batches already show in the hero bar (and the strip below when there
  // are several), so the mid-page promo only shows an admin banner.
  const midPromo = pickPromo({ banners: midBanners, batches: [] });
  const heroBanner = heroBanners[0] ?? null;
  const heroCta = heroBanner && isSafeHref(heroBanner.ctaLink) ? heroBanner : null;
  const batchList = Array.from(openBatches.values());
  const nextBatch = batchList[0] ?? null;
  // Admin-picked featured items win; otherwise show real courses and workshops.
  const programs = featuredCards.length > 0
    ? null
    : attachLiveBatches(published.filter((c) => c.type === "course" || c.type === "workshop"), openBatches).slice(0, 3);
  const hasPrograms = featuredCards.length > 0 || (programs?.length ?? 0) > 0;
  const faces = mentors.filter((m) => m.photo).slice(0, 3);
  // Phones swipe the program cards sideways; wider screens show a grid.
  const swipeItem = "w-[290px] shrink-0 snap-start md:w-auto";

  return (
    <>
      <MarketingNav />
      <main className="bg-pz-web-surface">

      {/* ─── 1. HERO ───────────────────────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-pz-solid-deep text-white">
        {/* Banner image, when an active hero banner is set — see /dashboard/admin/marketing */}
        {heroBanner?.imageUrl && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroBanner.imageUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-gradient-to-b from-pz-solid-deep/70 via-pz-solid-deep/80 to-pz-solid-deep" />
          </div>
        )}
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-pz-bright/15 blur-3xl md:right-1/4 md:left-auto md:h-[520px] md:w-[520px] md:translate-x-0 md:blur-[120px]" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-10 left-10 hidden h-96 w-96 rounded-full bg-pz-solid-forest/60 blur-[90px] md:block" />

        <div className="relative z-10 mx-auto max-w-[1440px] px-5 pt-24 md:px-12 md:pt-32">
          <div className="grid grid-cols-1 items-center gap-6 lg:min-h-[580px] lg:grid-cols-12 lg:gap-10">
            {/* Left: words and buttons */}
            <div className="flex flex-col items-center gap-6 text-center lg:col-span-7 lg:items-start lg:text-left">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-pz-solid-forest/80 px-4 py-1.5 font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright shadow-sm">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" /> Educating with Innovation
              </span>
              <div className="flex flex-col gap-3">
                <h1 className="max-w-[22ch] font-montserrat text-[28px] font-black leading-[34px] tracking-[-0.02em] text-white sm:text-[36px] sm:leading-[42px] lg:text-[56px] lg:leading-[64px] lg:tracking-[-0.03em]">
                  {heroBanner ? heroBanner.headline : (
                    <>
                      Empowering Minds{" "}
                      <span className="relative inline-block text-pz-bright">
                        To Master The Science
                        <svg aria-hidden="true" viewBox="0 0 300 12" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-2.5 w-full lg:-bottom-2 lg:h-3">
                          <path d="M3 9 C 80 2, 220 2, 297 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                        </svg>
                      </span>{" "}
                      Of Medicine
                    </>
                  )}
                </h1>
                <p className="mx-auto max-w-2xl pt-1 font-poppins text-base leading-relaxed text-white/80 lg:mx-0 lg:text-lg">
                  Live webinars, hands-on workshops, certified courses and 1-on-1 mentors for pharmacy and health sciences students.
                </p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
                {heroCta ? (
                  <Link href={heroCta.ctaLink} className={BTN_PRIMARY}>
                    {heroCta.ctaText} <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link href="#paths" className={BTN_PRIMARY}>
                    Find your program <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                )}
                <Link href="/webinars" className={BTN_GHOST_DARK}>Free webinars</Link>
              </div>
              {/* Quiet trust row */}
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-full bg-pz-solid-forest/60 px-4 py-2 lg:justify-start lg:gap-6 lg:bg-transparent lg:p-0">
                {faces.length > 0 && (
                  <span className="flex items-center gap-2.5">
                    <span className="flex -space-x-3">
                      {faces.map((m) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={m.id} src={m.photo} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full border-2 border-pz-solid-deep object-cover object-top shadow-md lg:h-10 lg:w-10" />
                      ))}
                    </span>
                    <span className="font-poppins text-xs font-medium text-white lg:text-sm">Taught by practising experts</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 font-poppins text-xs font-semibold text-pz-bright lg:rounded-full lg:bg-pz-solid-forest/50 lg:px-3.5 lg:py-1.5 lg:text-sm lg:text-white">
                  <ShieldCheck className="h-4 w-4 text-pz-bright" aria-hidden="true" /> SECP certified program
                </span>
              </div>
            </div>

            {/* Right: the pharmacist, cut out and blended into the green */}
            <div className="relative flex justify-center self-end lg:col-span-5">
              <div className="relative flex aspect-[4/5] w-full max-w-[300px] items-end justify-center sm:max-w-[360px] lg:max-w-[420px]">
                <svg aria-hidden="true" viewBox="0 0 400 400" className="absolute inset-x-0 top-[8%] mx-auto w-[92%] text-pz-bright">
                  <circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="2" strokeDasharray="10 14" />
                  <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" />
                </svg>
                <div aria-hidden="true" className="absolute bottom-4 h-60 w-60 rounded-full bg-pz-bright/20 blur-3xl lg:h-72 lg:w-72" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero-pharmacist.webp"
                  alt="A PZ Academy pharmacist in a white coat"
                  width={740}
                  height={877}
                  fetchPriority="high"
                  className="pointer-events-none relative z-10 h-full w-full select-none object-cover object-top [mask-image:linear-gradient(to_bottom,black_75%,transparent_100%)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live batch bar */}
        {nextBatch && (
          <div className="relative z-20 w-full bg-pz-solid-forest/95 px-5 py-3 md:px-12">
            <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 font-poppins text-sm">
              <p className="flex min-w-0 items-center gap-2.5 text-white">
                <span aria-hidden="true" className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pz-bright opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pz-bright" />
                </span>
                <span className="truncate">
                  Live batch<span className="hidden sm:inline"> open</span>: <span className="font-bold text-pz-bright">{nextBatch.title}</span>
                  {nextBatch.startsOn && <> — starts {nextBatch.startsOn}</>}
                </span>
              </p>
              <Link
                href={nextBatch.href}
                aria-label={`Register for live: ${nextBatch.title}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-1 font-montserrat text-sm font-bold text-pz-bright transition-colors hover:text-white"
              >
                Register <span className="hidden sm:inline">now</span> <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ─── 2. NUMBERS ───────────────────────────────────────────────────── */}
      <section aria-label="PZ Academy in numbers" className="w-full bg-pz-surface-container-lowest px-5 py-8 md:bg-pz-web-surface-low md:px-12 md:py-12">
        <ul className="mx-auto grid max-w-sm grid-cols-2 gap-3 text-center md:max-w-[1344px] md:grid-cols-4 md:gap-6">
          {STATS.map((s) => (
            <li key={s.label} className="flex flex-col items-center justify-center rounded-xl bg-pz-web-surface p-4 shadow-sm md:bg-transparent md:p-2 md:shadow-none">
              <span className="flex items-center gap-1.5 font-montserrat text-2xl font-black tracking-tight text-pz-deep md:text-[40px] md:leading-[48px]">
                {s.number === "SECP" && <Award className="h-6 w-6 text-pz-mid md:h-7 md:w-7" aria-hidden="true" />}
                <StatCounter value={s.number} />
              </span>
              <span className="mt-1 font-poppins text-sm font-medium text-pz-muted md:text-xs md:font-bold md:uppercase md:tracking-wider">{s.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── 3. FIND YOUR PROGRAM ─────────────────────────────────────────── */}
      <section id="paths" aria-labelledby="paths-title" className="w-full scroll-mt-20 bg-pz-web-surface px-5 py-12 md:px-12 md:py-20">
        <div className="mx-auto max-w-[1344px]">
          <SectionHeader
            kicker="Find your program"
            kickerId="paths-title"
            title="Start free, then level up"
            text="Four steps, one path — from a free webinar all the way to 1-on-1 mentorship."
            action={
              <span className="hidden items-center gap-2 font-poppins text-sm text-pz-muted lg:flex">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-pz-bright" /> Step-by-step career readiness
              </span>
            }
          />
          {/* Phones: a timeline with a line on the left. Wider screens: four cards. */}
          <div className="relative flex flex-col gap-4 pl-6 md:grid md:grid-cols-2 md:gap-6 md:pl-0 lg:grid-cols-4">
            <div aria-hidden="true" className="absolute bottom-3 left-2.5 top-3 w-1 rounded-full bg-pz-web-surface-high md:hidden" />
            {SERVICES.map((s, i) => (
              <Link
                key={s.title}
                href={s.href}
                className={`group relative flex flex-col justify-between gap-4 rounded-2xl bg-pz-surface-container-lowest p-5 transition-transform duration-200 hover:-translate-y-1 md:rounded-[24px] md:p-7 ${CARD_SHADOW}`}
              >
                <span aria-hidden="true" className={`absolute -left-6 top-6 flex h-4 w-4 items-center justify-center rounded-full md:hidden ${i === 0 ? "bg-pz-solid-mid" : "bg-pz-web-surface-high"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-pz-solid-deep"}`} />
                </span>
                <span className="flex flex-col gap-3 md:gap-4">
                  <span className="flex items-center justify-between">
                    <span className="font-poppins text-[11px] font-bold uppercase tracking-widest text-pz-muted/80">Step 0{i + 1}</span>
                    <span className={`rounded-full px-3 py-1 font-poppins text-xs font-bold ${s.tagClass}`}>{s.tag}</span>
                  </span>
                  <span className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-pz-web-surface-high text-pz-deep md:flex">
                    <s.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span>
                    <h3 className="mb-1 font-montserrat text-xl font-bold text-pz-deep">{s.title}</h3>
                    <span className="mb-2 block font-poppins text-xs font-semibold uppercase tracking-wider text-pz-mid">{s.step}</span>
                    <span className="block font-poppins text-sm text-pz-muted">{s.desc}</span>
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 font-montserrat text-[15px] font-bold text-pz-deep transition-colors group-hover:text-pz-mid">
                  {s.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Several open batches: list them all (the hero bar shows only the first). */}
      {batchList.length > 1 && <OpenBatchStrip batches={batchList} />}

      {/* ─── 4. POPULAR PROGRAMS ──────────────────────────────────────────── */}
      {hasPrograms && (
        <section aria-labelledby="home-programs" className="w-full overflow-hidden bg-pz-web-surface-low py-12 md:px-12 md:py-20">
          <div className="mx-auto max-w-[1344px]">
            <div className="px-5 md:px-0">
              <SectionHeader
                kicker="Enrolling now"
                title="Popular programs"
                titleId="home-programs"
                text="Clinically relevant, expert-led programs built for real exams and real jobs."
                action={
                  <Link href="/courses" className="inline-flex min-h-11 items-center gap-1 font-montserrat text-[15px] font-bold text-pz-deep transition-colors hover:text-pz-mid">
                    See all courses <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                }
              />
            </div>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-3">
              {programs
                ? programs.map((c) => <div key={c.id} className={swipeItem}><CourseCard course={c} /></div>)
                : featuredCards.map((f) => <div key={f.href + f.title} className={swipeItem}><FeaturedProgramCard item={f} /></div>)}
            </div>
          </div>
        </section>
      )}

      {/* ─── 5. QUICK QUIZ ───────────────────────────────────────────────── */}
      <section aria-labelledby="home-quiz" className="w-full bg-pz-web-surface px-5 py-12 md:px-12 md:py-20">
        <div className={`mx-auto max-w-[1344px] rounded-[24px] bg-pz-surface-container-lowest p-5 md:p-12 ${CARD_SHADOW}`}>
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12 lg:gap-10">
            <div className="flex flex-col gap-4 lg:col-span-5">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-pz-bright/40 px-3.5 py-1 font-poppins text-xs font-bold uppercase text-pz-solid-deep">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Test yourself
              </span>
              <h2 id="home-quiz" className="font-montserrat text-[28px] font-extrabold leading-[34px] tracking-[-0.02em] text-pz-deep md:text-[40px] md:leading-[48px]">
                Quick quiz: how sharp are you?
              </h2>
              <p className="font-poppins text-sm leading-relaxed text-pz-muted md:text-base">
                Four exam-style questions with instant answers. This is how our classes feel — short, clear and a little bit competitive.
              </p>
              <div className="hidden pt-2 lg:block">
                <Link href="/webinars" className={BTN_SOLID}>Learn it in a free webinar</Link>
              </div>
            </div>
            <div className="lg:col-span-7">
              <QuickQuiz questions={QUICK_QUIZ} />
            </div>
            <Link href="/webinars" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-pz-web-surface-low font-montserrat text-[15px] font-bold text-pz-deep lg:hidden">
              Learn it in a free webinar
            </Link>
          </div>
        </div>
      </section>

      <MentorStrip mentors={mentors} />

      {/* ─── 7. STUDENT STORIES ───────────────────────────────────────────── */}
      <section aria-labelledby="home-reviews" className="w-full bg-pz-web-surface px-5 py-12 md:px-12 md:py-20">
        <div className="mx-auto max-w-[1344px]">
          <SectionHeader kicker="Student stories" title="What students say" titleId="home-reviews" />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
            {REVIEWS.map((r) => (
              <li key={r.initials} className={`flex flex-col justify-between gap-6 rounded-[24px] bg-pz-surface-container-lowest p-6 md:p-10 ${CARD_SHADOW}`}>
                {/* No star rating: there are no verified public ratings yet. */}
                <p className="font-poppins text-base italic leading-relaxed text-pz-ink md:text-lg md:not-italic">&ldquo;{r.text}&rdquo;</p>
                <div className="flex items-center gap-4">
                  <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-montserrat text-sm font-bold md:h-12 md:w-12 md:text-lg ${r.avatar}`}>{r.initials}</span>
                  <span className="flex flex-col">
                    <span className="font-poppins text-base font-bold text-pz-deep">{r.author}</span>
                    <span className="font-poppins text-sm text-pz-muted">{r.role}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PromoSlot promo={midPromo} />

      {/* ─── 8. FINAL CALL TO ACTION ─────────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-pz-solid-deep px-5 py-12 text-white md:px-12 md:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[.06]" style={{ backgroundImage: LATTICE_BG, backgroundSize: "34px 34px" }} />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-pz-solid-forest px-4 py-1.5 font-poppins text-xs font-bold uppercase tracking-wider text-pz-bright">
            <GraduationCap className="h-4 w-4" aria-hidden="true" /> Enroll for the next cohort
          </span>
          <h2 className="font-montserrat text-[28px] font-black leading-[34px] tracking-[-0.02em] md:text-[40px] md:leading-[48px]">
            Build the expertise that transforms careers
          </h2>
          <p className="max-w-xl font-poppins text-base leading-relaxed text-white/80 md:text-lg">
            Learn with pharmacy and health sciences students across Pakistan, the UAE and KSA — evidence-based, expert-led, results-driven.
          </p>
          <div className="flex w-full max-w-sm flex-col gap-3 pt-2 sm:max-w-none sm:flex-row sm:justify-center">
            <Link href="#paths" className={BTN_PRIMARY}>
              Find your program <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link href="https://wa.me/923700199429" target="_blank" rel="noopener noreferrer" className={BTN_GHOST_DARK}>
              <MessageCircle className="h-5 w-5 text-pz-bright" aria-hidden="true" /> Ask us on WhatsApp
            </Link>
          </div>
        </div>
      </section>

      </main>
      <MarketingFooter />
    </>
  );
}
