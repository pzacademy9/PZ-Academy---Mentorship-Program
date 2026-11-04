import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { BookOpen, Video, Wrench, UserCheck, ArrowRight, Clock, Users, Award, Quote, MessageCircle } from "lucide-react";
import { getActiveBanners, getFeaturedItems } from "@/lib/data/marketing";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { OpenBatchStrip } from "@/components/marketing/OpenBatchStrip";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { PromoSlot } from "@/components/marketing/PromoSlot";
import { isSafeHref, pickPromo } from "@/lib/marketing/promo";

const STATS = [
  { icon: Video,    number: "12+",  label: "Live Webinars",     badge: null },
  { icon: BookOpen, number: "2+",   label: "Active Courses",    badge: null },
  { icon: Wrench,   number: "3+",   label: "Workshops",         badge: null },
  { icon: Award,    number: "SECP", label: "Certified Program", badge: "✓ Accredited" },
];

// The ladder: cheapest / easiest first, then step up. Order matters — it is the
// path the home page guides every visitor along.
const SERVICES = [
  { icon: Video,    step: "Start free",    title: "Webinars",   cta: "Watch free webinars", href: "/webinars",
    desc: "Join live expert-led webinars exploring the science behind modern medicines, innovative pharmaceutical practices, and current industry trends." },
  { icon: Wrench,   step: "Build a skill", title: "Workshops",  cta: "View Workshops",      href: "/workshops",
    desc: "Hands-on workshops covering innovative pharma concepts, practical approaches, and real-world problem solving guided by industry professionals." },
  { icon: BookOpen, step: "Get certified", title: "Courses",    cta: "Explore Courses",     href: "/courses",
    desc: "Enroll in structured pharmaceutical modules — build a strong foundation in pharmacology, drug mechanisms, and clinical applications at your own pace." },
  { icon: UserCheck,step: "1-on-1 help",   title: "Mentorship", cta: "Find a Mentor",       href: "/mentorship#mentors",
    desc: "Connect 1-on-1 with pharmaceutical experts and practitioners who'll guide your academic journey and help you navigate clinical challenges." },
];

/** Fallback shown until admins add real banners/featured items — see /dashboard/admin/marketing. */
const FEATURED_FALLBACK = [
  { badge: "Live Now", live: true, title: "Mastering Dose Calculations",
    desc: "A comprehensive module-based course covering pediatric, renal, and weight-based dosing. Build clinical confidence with real patient scenarios.",
    duration: "8 Weeks", enrolled: "240+ Enrolled", href: "/courses", grad: "from-pz-solid-forest to-pz-solid-mid" },
  { badge: "Interactive Quiz", live: false, title: "MED-Q — Quiz & Competition Platform",
    desc: "Compete in pharmacology tournaments, join weekly leagues, and track your progress against thousands of pharmacy students across Pakistan, UAE, and KSA.",
    duration: "Ongoing", enrolled: "500+ Active", href: "/courses", grad: "from-pz-solid-deep to-pz-solid-forest" },
];

const REVIEWS = [
  { text: '"Passed my pharmacology board exam on the first attempt. The dose calc course is brilliant."', author: "Sara A.", role: "Pharm.D Student",    initials: "SA" },
  { text: '"MED-Q tournaments kept me motivated every week. Best pharma community in Pakistan."',         author: "M. Kamran", role: "Final Year Student", initials: "MK" },
];

export default async function HomePage() {
  const [heroBanners, midBanners, featuredCards, openBatches] = await Promise.all([
    getActiveBanners("hero"),
    getActiveBanners("mid_page"),
    getFeaturedItems(),
    getOpenLiveBatches(),
  ]);
  // Open batches already have their own strip on this page, so the mid-page
  // promo only shows an admin banner (no duplicate batch box).
  const midPromo = pickPromo({ banners: midBanners, batches: [] });
  const heroBanner = heroBanners[0] ?? null;
  const heroCta = heroBanner && isSafeHref(heroBanner.ctaLink) ? heroBanner : null;
  const featured =
    featuredCards.length > 0
      ? featuredCards.map((f) => ({ ...f, live: false, enrolled: null as string | null }))
      : FEATURED_FALLBACK;

  return (
    <>
      <MarketingNav />
      <main>

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center text-center overflow-hidden bg-pz-solid-deep">
        {/* Banner image, when an active hero banner is set — see /dashboard/admin/marketing */}
        {heroBanner?.imageUrl && (
          <div className="absolute inset-0 z-[1]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroBanner.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-b from-pz-solid-deep/60 via-pz-solid-deep/70 to-pz-solid-deep" />
          </div>
        )}
        {/* Hex grid bg */}
        <div className="absolute inset-0 opacity-75" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C63 57%2C78 57%2C104 3%2C104 3%2C78'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 104px",
        }} />
        {/* Orbs */}
        <div className="absolute pointer-events-none rounded-full" style={{ width:600,height:600,top:-180,right:-120,background:"#7ED957",opacity:.07,filter:"blur(90px)",animation:"orbFloat1 12s ease-in-out infinite" }} />
        <div className="absolute pointer-events-none rounded-full" style={{ width:450,height:450,bottom:-80,left:-80,background:"#196432",opacity:.13,filter:"blur(90px)",animation:"orbFloat2 15s ease-in-out infinite" }} />
        <div className="absolute pointer-events-none rounded-full" style={{ width:300,height:300,bottom:"20%",right:"15%",background:"#7ED957",opacity:.06,filter:"blur(90px)",animation:"orbFloat3 10s ease-in-out infinite" }} />

        {/* Hero content */}
        <div className="relative z-[2] max-w-[840px] px-6 pt-28 pb-20">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full text-pz-bright text-xs font-poppins font-semibold tracking-widest uppercase"
            style={{background:"rgba(126,217,87,.10)",border:"1px solid rgba(126,217,87,.28)"}}>
            <span className="w-1.5 h-1.5 rounded-full bg-pz-bright animate-pulse" />
            Educating with Innovation
          </div>
          {heroBanner ? (
            <h1 className="font-montserrat font-black text-white leading-[1.06] tracking-tight mb-4" style={{fontSize:"clamp(2rem,6vw,4.5rem)",letterSpacing:"-.02em"}}>
              {heroBanner.headline}
            </h1>
          ) : (
            <h1 className="font-montserrat font-black text-white leading-[1.06] tracking-tight mb-4" style={{fontSize:"clamp(2rem,6vw,4.5rem)",letterSpacing:"-.02em"}}>
              Empowering Minds<br /><em className="not-italic text-pz-bright">To Master The Science</em><br />Of Medicine
            </h1>
          )}
          <p className="font-poppins text-[rgba(255,255,255,.62)] max-w-[560px] mx-auto mt-4 mb-10 leading-relaxed" style={{fontSize:"clamp(.95rem,1.6vw,1.1rem)"}}>
            PZ Academy by Pharmacozyme — combining innovation, research, and real-world learning to shape the next generation of pharmaceutical leaders.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            {heroCta ? (
              <Link href={heroCta.ctaLink} className="inline-flex min-h-11 items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.35)]">
                <BookOpen className="w-4 h-4" aria-hidden="true" /> {heroCta.ctaText}
              </Link>
            ) : (
              <Link href="#paths" className="inline-flex min-h-11 items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.35)]">
                Find your program <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            )}
            <Link href="/webinars"
              className="inline-flex min-h-11 items-center gap-2 font-poppins font-semibold text-sm text-white px-7 py-3.5 rounded-full border border-[rgba(255,255,255,.32)] transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
              <Video className="w-4 h-4" aria-hidden="true" /> Free webinars
            </Link>
          </div>
        </div>

        {/* Scroll cue */}
        <div aria-hidden="true" className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-1.5 text-[rgba(255,255,255,.5)] pointer-events-none">
          <div className="w-px h-10 bg-gradient-to-b from-[rgba(255,255,255,.35)] to-transparent" style={{animation:"scrollLine 1.6s ease-in-out infinite"}} />
          <span className="text-[.68rem] tracking-[.12em] uppercase font-poppins">Scroll</span>
        </div>
      </section>

      {/* ─── SERVICES ─────────────────────────────────────────────────────── */}
      <section id="paths" aria-labelledby="paths-title" className="bg-pz-offwhite py-16 md:py-24 px-6 scroll-mt-20">
        <div className="max-w-[1060px] mx-auto">
          <div className="text-center mb-14">
            <span id="paths-title" className="font-poppins text-[.75rem] font-semibold tracking-[.13em] uppercase text-pz-mid mb-3 block">Find your program</span>
            <h2 className="font-montserrat font-extrabold text-pz-forest leading-tight mb-4" style={{fontSize:"clamp(1.7rem,3vw,2.5rem)",letterSpacing:"-.015em"}}>
              Pharma Made Simple,<br /><em className="not-italic text-pz-mid">Learning Made Effective</em>
            </h2>
            <p className="font-poppins text-pz-muted text-[.97rem] max-w-[520px] mx-auto leading-relaxed">
              From formulation to patient care — every concept made clear, memorable, and clinically relevant.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SERVICES.map((s) => (
              <Link key={s.title} href={s.href}
                className="group bg-white rounded-xl p-7 border-[1.5px] border-pz-border flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-card-lg hover:border-pz-solid-mid relative overflow-hidden">
                <div className="absolute bottom-0 left-0 right-0 h-[3px] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-350"
                  style={{background:"linear-gradient(90deg,#194B32,#7ED957)"}} />
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-5 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-250"
                  style={{background:"linear-gradient(135deg,#0F3D22,#196432)"}}>
                  <s.icon className="w-5 h-5 text-pz-bright stroke-[1.8]" />
                </div>
                <span className="font-poppins text-[.75rem] font-bold uppercase tracking-[.1em] text-pz-mid mb-1">{s.step}</span>
                <h3 className="font-montserrat font-bold text-pz-forest text-lg mb-3">{s.title}</h3>
                <p className="font-poppins text-pz-muted text-sm leading-relaxed flex-1">{s.desc}</p>
                <div className="mt-5 flex items-center gap-1.5 text-pz-forest text-sm font-poppins font-semibold group-hover:gap-3 transition-all duration-200">
                  {s.cta} <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <OpenBatchStrip batches={Array.from(openBatches.values())} />

      {/* ─── STATS ────────────────────────────────────────────────────────── */}
      <section className="bg-white border-b border-pz-border">
        <div className="max-w-[1060px] mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-5">
          {STATS.map((s) => (
            <div key={s.label} className="group flex flex-col items-center text-center p-6 rounded-xl border-[1.5px] border-transparent transition-all duration-250 hover:bg-pz-offwhite hover:border-pz-border hover:-translate-y-1 hover:shadow-card cursor-default">
              <div className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-250"
                style={{background:"linear-gradient(135deg,#194B32,#196432)"}}>
                <s.icon className="w-[22px] h-[22px] text-white stroke-[1.9]" />
              </div>
              <span className="font-montserrat font-extrabold text-pz-forest text-[2.2rem] leading-none mb-1">{s.number}</span>
              <span className="font-poppins text-pz-muted text-sm font-medium">{s.label}</span>
              {s.badge && (
                <span className="mt-2 inline-flex items-center gap-1 text-white text-[.7rem] font-bold px-3 py-1 rounded-full"
                  style={{background:"linear-gradient(135deg,#194B32,#196432)"}}>
                  {s.badge}
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── REVIEWS ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="home-reviews" className="bg-pz-offwhite py-16 px-6">
        <div className="max-w-[1060px] mx-auto">
          <h2 id="home-reviews" className="font-montserrat font-extrabold text-pz-forest text-center mb-8" style={{fontSize:"clamp(1.4rem,2.5vw,2rem)"}}>
            What students say
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {REVIEWS.map((r) => (
              <li key={r.initials} className="bg-white rounded-xl border-[1.5px] border-pz-border p-6">
                {/* No star rating: there are no verified public ratings yet. */}
                <Quote className="w-4 h-4 text-pz-mid mb-2" aria-hidden="true" />
                <p className="font-poppins text-pz-forest italic leading-relaxed mb-4">{r.text}</p>
                <div className="flex items-center gap-2.5">
                  <div aria-hidden="true" className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white" style={{background:"linear-gradient(135deg,#7ED957,#196432)"}}>{r.initials}</div>
                  <span className="font-poppins text-sm text-pz-muted">{r.author} — {r.role}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <PromoSlot promo={midPromo} />


      {/* ─── FEATURED PROGRAMS ────────────────────────────────────────────── */}
      <section className="bg-white py-24 px-6">
        <div className="max-w-[1060px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-poppins text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid mb-3 block">Active Programs</span>
            <h2 className="font-montserrat font-extrabold text-pz-forest leading-tight mb-4" style={{fontSize:"clamp(1.7rem,3vw,2.5rem)",letterSpacing:"-.015em"}}>
              Featured <em className="not-italic text-pz-mid">Learning Programs</em>
            </h2>
            <p className="font-poppins text-pz-muted text-[.97rem] max-w-[520px] mx-auto leading-relaxed">
              Currently running — enroll now and join thousands of students transforming their pharmaceutical knowledge.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {featured.map((f) => (
              <Link key={f.title} href={f.href}
                className="group flex flex-col bg-pz-offwhite rounded-xl border-[1.5px] border-pz-border overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-card-lg hover:border-pz-solid-mid">
                <div className={`h-1.5 bg-gradient-to-r ${f.grad}`} />
                <div className="p-8 flex flex-col flex-1">
                  <span className={`self-start mb-4 text-xs font-poppins font-bold px-3 py-1 rounded-full ${f.live ? "bg-pz-bright text-pz-forest" : "bg-pz-solid-forest/10 text-pz-forest"}`}>
                    {f.badge}
                  </span>
                  <h3 className="font-montserrat font-bold text-pz-forest text-xl mb-3 group-hover:text-pz-mid transition-colors">{f.title}</h3>
                  <p className="font-poppins text-pz-muted text-sm leading-relaxed flex-1">{f.desc}</p>
                  <div className="mt-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-pz-muted font-poppins">
                      {f.duration && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> {f.duration}</span>}
                      {f.enrolled && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5"/> {f.enrolled}</span>}
                    </div>
                    <span className="font-poppins font-semibold text-sm text-pz-forest group-hover:text-pz-mid flex items-center gap-1 group-hover:gap-2 transition-all">
                      Enroll Now <ArrowRight className="w-4 h-4"/>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 relative overflow-hidden bg-pz-solid-forest">
        <div className="absolute inset-0 opacity-5"
          style={{backgroundImage:"radial-gradient(circle at 2px 2px, #7ED957 1px, transparent 0)",backgroundSize:"28px 28px"}} />
        <div className="relative z-10 max-w-[680px] mx-auto text-center">
          <span className="font-poppins text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-bright mb-4 block">
            Ready to Elevate Your Career?
          </span>
          <h2 className="font-montserrat font-black text-white mb-5 leading-tight" style={{fontSize:"clamp(1.8rem,3.5vw,2.8rem)",letterSpacing:"-.02em"}}>
            Build the expertise that<br /><span className="text-pz-bright">transforms careers</span>
          </h2>
          <p className="font-poppins text-[rgba(255,255,255,.65)] leading-relaxed mb-10 max-w-[480px] mx-auto">
            Join thousands of medical and health sciences professionals growing with PZ Academy — evidence-based, expert-led, results-driven.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="#paths" className="inline-flex min-h-11 items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-8 py-3.5 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-gold">
              Find your program <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link href="https://wa.me/923700199429" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-white font-poppins font-semibold px-8 py-3.5 rounded-full border border-[rgba(255,255,255,.3)] transition-all duration-200 hover:border-pz-bright hover:text-pz-bright">
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> Ask us on WhatsApp
            </Link>
          </div>
        </div>
      </section>

      </main>
      <MarketingFooter />
    </>
  );
}
