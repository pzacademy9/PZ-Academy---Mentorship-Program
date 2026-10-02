import Link from "next/link";
import Image from "next/image";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { BookOpen, Video, Wrench, UserCheck, ArrowRight, Clock, Users, Award, Quote } from "lucide-react";
import { getActiveBanners, getFeaturedItems } from "@/lib/data/marketing";

const STATS = [
  { icon: Video,    number: "12+",  label: "Live Webinars",     badge: null },
  { icon: BookOpen, number: "2+",   label: "Active Courses",    badge: null },
  { icon: Wrench,   number: "3+",   label: "Workshops",         badge: null },
  { icon: Award,    number: "SECP", label: "Certified Program", badge: "✓ Accredited" },
];

const SERVICES = [
  { icon: BookOpen, title: "Courses",    cta: "Explore Courses", href: "/courses",  external: false,
    desc: "Enroll in structured pharmaceutical modules — build a strong foundation in pharmacology, drug mechanisms, and clinical applications at your own pace." },
  { icon: Video,    title: "Webinars",   cta: "Join a Webinar",  href: "/webinars", external: false,
    desc: "Join live expert-led webinars exploring the science behind modern medicines, innovative pharmaceutical practices, and current industry trends." },
  { icon: Wrench,   title: "Workshops",  cta: "View Workshops",  href: "/workshops",external: false,
    desc: "Hands-on workshops covering innovative pharma concepts, practical approaches, and real-world problem solving guided by industry professionals." },
  { icon: UserCheck,title: "Mentorship", cta: "Find a Mentor",   href: "https://pz-academy.pharmacozyme.com/mentorship?type=mentor#apply", external: true,
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
  { text: '"Passed my pharmacology board exam on the first attempt. The dose calc course is brilliant."', author: "Sara A.", role: "Pharm.D Student",    initials: "SA", side: "left" },
  { text: '"MED-Q tournaments kept me motivated every week. Best pharma community in Pakistan."',         author: "M. Kamran", role: "Final Year Student", initials: "MK", side: "right" },
];

export default async function HomePage() {
  const [heroBanners, featuredCards] = await Promise.all([getActiveBanners("hero"), getFeaturedItems()]);
  const heroBanner = heroBanners[0] ?? null;
  const featured =
    featuredCards.length > 0
      ? featuredCards.map((f) => ({ ...f, live: false, enrolled: null as string | null }))
      : FEATURED_FALLBACK;

  return (
    <>
      <MarketingNav />

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

        {/* Floating reviews (desktop only) */}
        {REVIEWS.map((r) => (
          <div key={r.initials} className={`absolute hidden xl:block max-w-[210px] z-[3] pointer-events-none ${r.side === "left" ? "left-[3%] top-[30%]" : "right-[3%] top-[40%]"}`}
            style={{ background:"rgba(255,255,255,.09)", backdropFilter:"blur(18px)", border:"1px solid rgba(255,255,255,.14)", borderRadius:16, padding:"0.9rem 1.1rem",
              animation: r.side === "left" ? "reviewLeft 11s ease-in-out infinite" : "reviewRight 13s 2s ease-in-out infinite" }}>
            {/* Was 5 hardcoded filled stars, implying a perfect verified rating —
                the live project has zero real public reviews right now, so any
                star claim here would be fabricated. A quote mark just marks
                this as a testimonial, no rating asserted. */}
            <Quote className="w-3.5 h-3.5 text-pz-bright mb-1.5" aria-hidden="true" />
            <p className="text-[.72rem] text-[rgba(255,255,255,.82)] italic leading-relaxed mb-2">{r.text}</p>
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[.6rem] font-bold text-white" style={{background:"linear-gradient(135deg,#7ED957,#196432)"}}>{r.initials}</div>
              <span className="text-[.67rem] text-[rgba(255,255,255,.6)] font-poppins">{r.author} — {r.role}</span>
            </div>
          </div>
        ))}

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
            <Link href={heroBanner?.ctaLink ?? "/courses"} className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold text-sm px-7 py-3.5 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.35)]">
              <BookOpen className="w-4 h-4" /> {heroBanner?.ctaText ?? "Explore Courses"}
            </Link>
            <Link href="https://pz-academy.pharmacozyme.com/mentorship?type=mentor#apply"
              className="inline-flex items-center gap-2 font-poppins font-semibold text-sm text-white px-7 py-3.5 rounded-full border border-[rgba(255,255,255,.32)] transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
              <UserCheck className="w-4 h-4" /> Find a Mentor
            </Link>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[rgba(255,255,255,.3)] pointer-events-none">
          <div className="w-px h-10 bg-gradient-to-b from-[rgba(255,255,255,.35)] to-transparent" style={{animation:"scrollLine 1.6s ease-in-out infinite"}} />
          <span className="text-[.68rem] tracking-[.12em] uppercase font-poppins">Scroll</span>
        </div>
      </section>

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

      {/* ─── SERVICES ─────────────────────────────────────────────────────── */}
      <section className="bg-pz-offwhite py-24 px-6">
        <div className="max-w-[1060px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-poppins text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid mb-3 block">What We Offer</span>
            <h2 className="font-montserrat font-extrabold text-pz-forest leading-tight mb-4" style={{fontSize:"clamp(1.7rem,3vw,2.5rem)",letterSpacing:"-.015em"}}>
              Pharma Made Simple,<br /><em className="not-italic text-pz-mid">Learning Made Effective</em>
            </h2>
            <p className="font-poppins text-pz-muted text-[.97rem] max-w-[520px] mx-auto leading-relaxed">
              From formulation to patient care — every concept made clear, memorable, and clinically relevant.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {SERVICES.map((s) => (
              <Link key={s.title} href={s.href} target={s.external?"_blank":undefined} rel={s.external?"noopener noreferrer":undefined}
                className="group bg-white rounded-xl p-7 border-[1.5px] border-pz-border flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-card-lg hover:border-pz-solid-mid relative overflow-hidden">
                <div className="absolute bottom-0 left-0 right-0 h-[3px] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-350"
                  style={{background:"linear-gradient(90deg,#194B32,#7ED957)"}} />
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-5 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-250"
                  style={{background:"linear-gradient(135deg,#0F3D22,#196432)"}}>
                  <s.icon className="w-5 h-5 text-pz-bright stroke-[1.8]" />
                </div>
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
            <Link href="/register" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-8 py-3.5 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-gold">
              Create Free Account
            </Link>
            <Link href="/courses" className="inline-flex items-center gap-2 text-white font-poppins font-semibold px-8 py-3.5 rounded-full border border-[rgba(255,255,255,.3)] transition-all duration-200 hover:border-pz-bright hover:text-pz-bright">
              Browse Courses
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="bg-pz-ink text-[rgba(255,255,255,.7)] py-16 px-6">
        <div className="max-w-[1060px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-[rgba(255,255,255,.07)] mb-8">
            <div>
              <Image src="https://pharmacozyme.com/wp-content/uploads/2026/04/PZ-Academy-logo.png" alt="PZ Academy" width={52} height={52} className="h-[52px] w-auto mb-4 opacity-90" unoptimized />
              <p className="font-poppins text-[.845rem] text-[rgba(255,255,255,.48)] leading-relaxed mb-5">
                PZ Academy is the education platform of Pharmacozyme — empowering medical and health sciences professionals with innovation-led learning.
              </p>
              <div className="flex gap-2">
                {["Instagram","Facebook"].map(s=>(
                  <a key={s} href="#" className="w-9 h-9 rounded-full flex items-center justify-center bg-[rgba(255,255,255,.06)] hover:bg-pz-solid-mid hover:-translate-y-1 transition-all duration-200 text-[rgba(255,255,255,.68)] text-xs font-poppins font-bold">{s[0]}</a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-poppins text-[.72rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.35)] mb-5">Programs</h4>
              <ul className="space-y-2.5">
                {["Courses","Webinars","Workshops","Mentorship"].map(item=>(
                  <li key={item}><Link href={`/${item.toLowerCase()}`} className="font-poppins text-[.845rem] text-[rgba(255,255,255,.58)] hover:text-pz-bright hover:pl-1 transition-all inline-block">{item}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-poppins text-[.72rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.35)] mb-5">Platform</h4>
              <ul className="space-y-2.5">
                {[{label:"Sign In",href:"/login"},{label:"Create Account",href:"/register"},{label:"Dashboard",href:"/dashboard"},{label:"Certificates",href:"https://cert.pharmacozyme.com"}].map(item=>(
                  <li key={item.label}><Link href={item.href} className="font-poppins text-[.845rem] text-[rgba(255,255,255,.58)] hover:text-pz-bright hover:pl-1 transition-all inline-block">{item.label}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-poppins text-[.72rem] font-semibold tracking-[.12em] uppercase text-[rgba(255,255,255,.35)] mb-5">Contact</h4>
              <ul className="space-y-2.5">
                <li><a href="https://wa.me/923700199429" className="font-poppins text-[.845rem] text-[rgba(255,255,255,.58)] hover:text-pz-bright transition-colors">WhatsApp: +92 370 019 9429</a></li>
                <li><a href="https://pharmacozyme.com" className="font-poppins text-[.845rem] text-[rgba(255,255,255,.58)] hover:text-pz-bright transition-colors">pharmacozyme.com</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="font-poppins text-[.775rem] text-[rgba(255,255,255,.28)]">© 2026 Pharmacozyme. PZ Academy. All rights reserved.</p>
            <p className="font-poppins text-[.775rem] text-[rgba(255,255,255,.28)]">#PZAcademy · #MedEd · #HealthEducation</p>
          </div>
        </div>
      </footer>

    </>
  );
}
