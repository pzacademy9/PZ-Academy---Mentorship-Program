import { Users, Award, BookOpen, Shield, Monitor } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { getPublishedCourses } from "@/lib/data/lms";

const BENEFITS = [
  { icon: Users,       title: "Expert-Led Faculty",          desc: "Learn directly from board-certified pharmacists, clinical specialists, and industry veterans with decades of real-world experience." },
  { icon: Shield,      title: "Clinically Relevant Content", desc: "Every module is built around real patient scenarios, live case studies, and evidence-based guidelines — not just textbook theory." },
  { icon: Monitor,     title: "Flexible Online Learning",    desc: "Study on your own schedule from anywhere in the world. Access recorded sessions, notes, and MCQ banks 24/7 on any device." },
  { icon: Award,       title: "SECP Accredited Certificate", desc: "Receive an officially recognised certificate on completion — valued by healthcare employers across Pakistan, UAE, and KSA." },
  { icon: Users,       title: "Peer Community Access",       desc: "Join our 100K+ student network on MED-Q — compete in weekly quizzes, exchange knowledge, and grow alongside your peers." },
  { icon: BookOpen,    title: "Board Exam Ready",            desc: "Our structured MCQ banks, timed practice papers, and board-focused summaries give you everything needed to ace your licensing exams." },
];

const FAQS = [
  { q: "Who are these courses designed for?", a: "Both PPC and MDC are designed for <strong>pharmacy students, Pharm.D candidates, pharmacists, and healthcare professionals</strong> who want to strengthen their clinical skills. PPC suits all levels including beginners, while MDC is ideal for anyone who wants hands-on mastery of dose calculations — from students to practicing clinicians." },
  { q: "Are the sessions live or pre-recorded?", a: "We offer a <strong>blended format</strong> — core lectures are available as on-demand recordings so you can learn at your own pace, supplemented by scheduled <strong>live interactive sessions</strong> for Q&A, case discussions, and doubt-clearing with our faculty." },
  { q: "Will I receive a certificate after completing the course?", a: "Yes! All students who complete the course requirements receive a <strong>SECP-accredited digital certificate of completion</strong>. This certificate is recognised by pharmaceutical employers and academic institutions across Pakistan, the UAE, and KSA." },
  { q: "How do I secure my spot in the upcoming batch?", a: "Simply click <strong>Register for PPC</strong> or <strong>Register for MDC</strong> on this page. You'll be redirected to our secure registration form. Once submitted, our team will contact you within 24–48 hours with course details, payment options, and your batch schedule." },
  { q: "Do I need any prior knowledge to enroll?", a: "For <strong>PPC</strong>, no prior advanced knowledge is required — the course is designed to build from foundational concepts upward. <strong>MDC</strong> is the same — it builds dose-calculation skills from the fundamentals through hands-on clinical scenarios, so no advanced background is needed." },
  { q: "Can I enroll in both PPC and MDC together?", a: "Absolutely! Many of our students enroll in both programs to build a comprehensive skill set. Our team can help you <strong>schedule both courses</strong> without overlap and may offer a bundled registration option. Contact us via WhatsApp or email for more details." },
];

export default async function CoursesPage() {
  const courses = await getPublishedCourses("course");

  return (
    <>
      <MarketingNav />

      {/* ─── HERO ─── */}
      <section className="bg-pz-surface-container-lowest py-16 md:py-24 border-b border-pz-surface-variant/30">
        <div className="max-w-[1280px] mx-auto px-8 md:px-16">
          <h1 className="font-headline text-5xl md:text-6xl font-black text-pz-on-surface mb-6 tracking-tight">
            Explore Our <span className="text-pz-primary">Courses</span>
          </h1>
          <p className="font-body text-xl text-pz-on-surface-variant max-w-2xl leading-relaxed">
            Advance your clinical knowledge with our expert-led pharmacy modules. Stay ahead of
            the curve with peer-reviewed curriculum and certified mastery.
          </p>
        </div>
      </section>

      {/* ─── COURSES ─── */}
      <div id="courses" className="max-w-[1280px] mx-auto px-8 md:px-16 py-12">
        <CourseCatalogGrid courses={courses} />
      </div>

      {/* ─── BENEFITS ─── */}
      <section className="py-24 px-6 bg-white relative z-10">
        <div className="max-w-[1060px] mx-auto">
          <div className="text-center mb-14">
            <span className="text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid font-poppins">Why Choose Us</span>
            <h2 className="font-montserrat text-[clamp(1.7rem,3vw,2.5rem)] font-extrabold text-pz-deep leading-[1.18] mt-2 mb-3">Built By Pharmacists,<br /><em className="not-italic text-pz-mid">For Pharmacists</em></h2>
            <p className="text-[.97rem] text-pz-muted max-w-[520px] mx-auto leading-[1.75] font-poppins">Every program is designed to deliver real clinical impact, not just certificates.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="group p-8 rounded-2xl border-[1.5px] border-pz-border relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-card-lg hover:border-transparent hover:bg-pz-offwhite after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-gradient-to-r after:from-pz-solid-forest after:to-pz-bright after:scale-x-0 after:origin-left after:transition-transform after:duration-[350ms] hover:after:scale-x-100">
                <div className="w-[52px] h-[52px] rounded-[14px] bg-gradient-to-br from-pz-solid-forest to-pz-solid-mid flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[5deg] group-hover:shadow-[0_8px_20px_rgba(25,75,50,.3)]">
                  <Icon className="w-6 h-6 text-white" strokeWidth={1.9} />
                </div>
                <h3 className="font-montserrat text-[1.08rem] font-bold text-pz-deep mb-2 transition-colors duration-200 group-hover:text-pz-forest">{title}</h3>
                <p className="text-[.855rem] text-pz-muted leading-[1.7] font-poppins">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-24 px-6 bg-pz-offwhite relative z-10">
        <div className="max-w-[760px] mx-auto">
          <div className="text-center mb-14">
            <span className="text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid font-poppins">Got Questions?</span>
            <h2 className="font-montserrat text-[clamp(1.7rem,3vw,2.5rem)] font-extrabold text-pz-deep leading-[1.18] mt-2 mb-3">Frequently Asked <em className="not-italic text-pz-mid">Questions</em></h2>
            <p className="text-[.97rem] text-pz-muted max-w-[520px] mx-auto leading-[1.75] font-poppins">Everything you need to know before you enroll.</p>
          </div>
          <FaqAccordion items={FAQS} />
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-24 px-6 bg-gradient-to-br from-pz-solid-deep to-[#1a4a2e] text-center relative overflow-hidden z-10">
        <div className="absolute inset-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.03)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3C/svg%3E")`, backgroundSize: "60px 104px" }} />
        <div className="relative z-10 max-w-[660px] mx-auto">
          <span className="text-pz-bright text-[.7rem] font-semibold tracking-[.13em] uppercase font-poppins">Take the Next Step</span>
          <h2 className="font-montserrat text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-[1.15] tracking-[-0.015em] mt-3 mb-4">Ready to <em className="not-italic text-pz-bright">Elevate</em> Your<br />Pharmacology Expertise?</h2>
          <p className="text-[rgba(255,255,255,.65)] text-[.97rem] leading-[1.8] mb-10 font-poppins">Secure your spot in the upcoming batch and begin a learning experience that goes far beyond the classroom.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="#courses" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-8 py-4 rounded-full text-base transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
              <BookOpen className="w-5 h-5" /> Explore Courses
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
