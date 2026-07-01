import Link from "next/link";
import { Clock, Users, Video, Award, BookOpen, Shield, Monitor, CheckCircle } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";

const BENEFITS = [
  { icon: Users,       title: "Expert-Led Faculty",          desc: "Learn directly from board-certified pharmacists, clinical specialists, and industry veterans with decades of real-world experience." },
  { icon: Shield,      title: "Clinically Relevant Content", desc: "Every module is built around real patient scenarios, live case studies, and evidence-based guidelines — not just textbook theory." },
  { icon: Monitor,     title: "Flexible Online Learning",    desc: "Study on your own schedule from anywhere in the world. Access recorded sessions, notes, and MCQ banks 24/7 on any device." },
  { icon: Award,       title: "SECP Accredited Certificate", desc: "Receive an officially recognised certificate on completion — valued by healthcare employers across Pakistan, UAE, and KSA." },
  { icon: Users,       title: "Peer Community Access",       desc: "Join our 100K+ student network on MED-Q — compete in weekly quizzes, exchange knowledge, and grow alongside your peers." },
  { icon: BookOpen,    title: "Board Exam Ready",            desc: "Our structured MCQ banks, timed practice papers, and board-focused summaries give you everything needed to ace your licensing exams." },
];

const PPC_HIGHLIGHTS = [
  "Drug mechanisms, receptor pharmacology & pharmacokinetics",
  "Pediatric, renal & weight-based dose calculations",
  "Drug-drug interactions & adverse effect management",
  "Clinical case studies with worked solutions",
  "Board exam preparation strategies & MCQ banks",
  "Live Q&A sessions with expert faculty",
];

const AMS_HIGHLIGHTS = [
  "Principles of antimicrobial stewardship & global AMR",
  "Mechanisms of antibiotic action & resistance",
  "PK/PD optimisation in antibiotic prescribing",
  "Culture & sensitivity interpretation, empiric therapy",
  "Infection-specific modules: respiratory, UTI, surgical",
  "De-escalation strategies & formulary management",
];

const FAQS = [
  { q: "Who are these courses designed for?", a: "Both PPC and AMS are designed for <strong>pharmacy students, Pharm.D candidates, pharmacists, and healthcare professionals</strong> who want to strengthen their clinical pharmacology knowledge. PPC suits all levels including beginners, while AMS is best suited for those with a basic understanding of pharmacology and microbiology." },
  { q: "Are the sessions live or pre-recorded?", a: "We offer a <strong>blended format</strong> — core lectures are available as on-demand recordings so you can learn at your own pace, supplemented by scheduled <strong>live interactive sessions</strong> for Q&A, case discussions, and doubt-clearing with our faculty." },
  { q: "Will I receive a certificate after completing the course?", a: "Yes! All students who complete the course requirements receive a <strong>SECP-accredited digital certificate of completion</strong>. This certificate is recognised by pharmaceutical employers and academic institutions across Pakistan, the UAE, and KSA." },
  { q: "How do I secure my spot in the upcoming batch?", a: "Simply click <strong>Register for PPC</strong> or <strong>Register for AMS</strong> on this page. You'll be redirected to our secure registration form. Once submitted, our team will contact you within 24–48 hours with course details, payment options, and your batch schedule." },
  { q: "Do I need any prior knowledge to enroll?", a: "For <strong>PPC</strong>, no prior advanced knowledge is required — the course is designed to build from foundational concepts upward. For <strong>AMS</strong>, a basic understanding of pharmacology and microbiology is recommended to get the most out of the program." },
  { q: "Can I enroll in both PPC and AMS together?", a: "Absolutely! Many of our students enroll in both programs to build a comprehensive skill set. Our team can help you <strong>schedule both courses</strong> without overlap and may offer a bundled registration option. Contact us via WhatsApp or email for more details." },
];

export default function CoursesPage() {
  return (
    <>
      <MarketingNav />

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center justify-center text-center overflow-hidden bg-pz-deep">
        <div className="absolute inset-0 opacity-75" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C63 57%2C78 57%2C104 3%2C104 3%2C78'/%3E%3C/svg%3E")`, backgroundSize: "60px 104px" }} />
        <div className="absolute w-[600px] h-[600px] rounded-full bg-pz-bright opacity-[.07] blur-[90px] -top-[180px] -right-[120px] animate-[orbFloat1_12s_ease-in-out_infinite] pointer-events-none" />
        <div className="absolute w-[450px] h-[450px] rounded-full bg-pz-mid opacity-[.13] blur-[90px] -bottom-20 -left-20 animate-[orbFloat2_15s_ease-in-out_infinite] pointer-events-none" />

        <div className="relative z-10 max-w-[820px] px-6 pt-28 pb-16">
          <div className="inline-flex items-center gap-2 bg-[rgba(126,217,87,.1)] border border-[rgba(126,217,87,.28)] text-pz-bright text-[.72rem] font-semibold tracking-[.1em] uppercase px-4 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-pz-bright rounded-full animate-[pls_2s_ease-in-out_infinite]" />
            SECP Certified Courses
          </div>
          <h1 className="font-montserrat text-[clamp(1.9rem,6vw,4.25rem)] font-extrabold text-white leading-[1.08] tracking-[-0.02em] mb-0">
            Sharpen Your Skills.<br /><em className="not-italic text-pz-bright">Deepen Your Knowledge.</em><br />Transform Patient Care.
          </h1>
          <p className="text-[clamp(.95rem,1.6vw,1.1rem)] text-[rgba(255,255,255,.62)] max-w-[560px] mx-auto mt-5 mb-10 leading-[1.75] font-poppins">
            Enroll in our expert-crafted pharmacology programs designed for ambitious pharmacy students and healthcare professionals ready to lead the future of medicine.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <a href="#courses" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-7 py-3 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
              <BookOpen className="w-[17px] h-[17px]" /> View Courses
            </a>
            <a href="https://pharmacozyme.com/official-ppc-registration-page/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white border-[1.5px] border-[rgba(255,255,255,.32)] font-poppins font-semibold px-7 py-3 rounded-full transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
              <CheckCircle className="w-[17px] h-[17px]" /> Register Now
            </a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[rgba(255,255,255,.3)] text-[.68rem] tracking-[.12em] uppercase z-10">
          <div className="w-px h-[38px] bg-gradient-to-b from-[rgba(255,255,255,.35)] to-transparent animate-[scrollLine_1.6s_ease-in-out_infinite]" />
          <span>Scroll</span>
        </div>
      </section>

      {/* ─── COURSES ─── */}
      <section id="courses" className="py-24 px-6 bg-pz-offwhite relative z-10">
        <div className="max-w-[1060px] mx-auto">
          <div className="text-center mb-14">
            <span className="text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid font-poppins">Currently Enrolling</span>
            <h2 className="font-montserrat text-[clamp(1.7rem,3vw,2.5rem)] font-extrabold text-pz-deep leading-[1.18] tracking-[-0.015em] mt-2 mb-3">Choose Your <em className="not-italic text-pz-mid">Learning Path</em></h2>
            <p className="text-[.97rem] text-pz-muted max-w-[520px] mx-auto leading-[1.75] font-poppins">Two rigorous, career-defining programs built for the next generation of pharmaceutical leaders.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* PPC Card */}
            <div className="bg-white rounded-[20px] border-[1.5px] border-pz-border overflow-hidden flex flex-col transition-all duration-[350ms] hover:-translate-y-2 hover:shadow-[0_24px_56px_rgba(15,61,34,.16)] hover:border-transparent">
              <div className="p-10 pb-8 relative overflow-hidden bg-gradient-to-br from-pz-deep to-pz-forest min-h-[220px]">
                <div className="absolute w-[220px] h-[220px] rounded-full bg-[rgba(126,217,87,.07)] -top-[60px] -right-[50px] transition-transform duration-400 group-hover:scale-125" />
                <span className="inline-flex items-center gap-1.5 bg-[rgba(126,217,87,.14)] border border-[rgba(126,217,87,.3)] text-pz-bright text-[.67rem] font-bold tracking-[.09em] uppercase px-3 py-1 rounded-full mb-4 relative z-10">
                  <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-[pls_1.4s_infinite]" /> Enrolling Now
                </span>
                <div className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,.1)] border border-[rgba(255,255,255,.14)] flex items-center justify-center mb-4 relative z-10">
                  <BookOpen className="w-6 h-6 text-pz-bright" strokeWidth={1.8} />
                </div>
                <h2 className="font-montserrat text-2xl font-extrabold text-white leading-[1.2] mb-1 relative z-10">Practical Pharmacology Course</h2>
                <p className="text-[rgba(255,255,255,.65)] text-sm font-poppins relative z-10">PPC — Build Clinical Confidence</p>
              </div>
              <div className="p-8 flex-1 flex flex-col">
                <p className="text-[.9rem] text-pz-muted leading-[1.75] mb-6 font-poppins">A structured, module-based deep dive into core pharmacology — from drug mechanisms and receptor theory to dose calculations and real patient scenarios.</p>
                <div className="mb-6">
                  <h4 className="text-[.72rem] font-bold tracking-[.1em] uppercase text-pz-deep font-montserrat mb-3">What You&apos;ll Cover</h4>
                  <ul className="flex flex-col gap-2.5">
                    {PPC_HIGHLIGHTS.map(h => (
                      <li key={h} className="flex items-start gap-2.5 text-[.845rem] text-pz-ink leading-snug font-poppins">
                        <span className="w-5 h-5 shrink-0 rounded-full bg-gradient-to-br from-pz-forest to-pz-mid flex items-center justify-center mt-0.5">
                          <CheckCircle className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                        </span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-4 flex-wrap py-4 border-y border-pz-border mb-6">
                  {[["clock", "8 Weeks"], ["users", "All Levels"], ["video", "Online + Live"], ["award", "Certificate"]].map(([icon, label]) => (
                    <span key={label} className="flex items-center gap-1.5 text-[.78rem] text-pz-muted font-poppins">
                      {icon === "clock"  && <Clock  className="w-3.5 h-3.5 text-pz-mid" />}
                      {icon === "users"  && <Users  className="w-3.5 h-3.5 text-pz-mid" />}
                      {icon === "video"  && <Video  className="w-3.5 h-3.5 text-pz-mid" />}
                      {icon === "award"  && <Award  className="w-3.5 h-3.5 text-pz-mid" />}
                      {label}
                    </span>
                  ))}
                </div>
                <a href="https://pharmacozyme.com/official-ppc-registration-page/" target="_blank" rel="noopener noreferrer" className="mt-auto block text-center bg-gradient-to-br from-pz-deep to-pz-forest text-white font-montserrat font-bold text-base py-4 rounded-full transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,61,34,.25)] relative overflow-hidden group">
                  <span className="relative z-10">Register for PPC →</span>
                  <span className="absolute inset-0 bg-[rgba(255,255,255,.1)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </a>
              </div>
            </div>

            {/* AMS Card */}
            <div className="bg-white rounded-[20px] border-[1.5px] border-pz-border overflow-hidden flex flex-col transition-all duration-[350ms] hover:-translate-y-2 hover:shadow-[0_24px_56px_rgba(15,61,34,.16)] hover:border-transparent">
              <div className="p-10 pb-8 relative overflow-hidden bg-gradient-to-br from-[#1a3d28] to-pz-mid min-h-[220px]">
                <div className="absolute w-[220px] h-[220px] rounded-full bg-[rgba(126,217,87,.07)] -top-[60px] -right-[50px]" />
                <span className="inline-flex items-center gap-1.5 bg-[rgba(126,217,87,.14)] border border-[rgba(126,217,87,.3)] text-pz-bright text-[.67rem] font-bold tracking-[.09em] uppercase px-3 py-1 rounded-full mb-4 relative z-10">
                  New Batch Open
                </span>
                <div className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,.1)] border border-[rgba(255,255,255,.14)] flex items-center justify-center mb-4 relative z-10">
                  <Shield className="w-6 h-6 text-pz-bright" strokeWidth={1.8} />
                </div>
                <h2 className="font-montserrat text-2xl font-extrabold text-white leading-[1.2] mb-1 relative z-10">Antimicrobial Stewardship Program</h2>
                <p className="text-[rgba(255,255,255,.65)] text-sm font-poppins relative z-10">AMS — Master Infection Management</p>
              </div>
              <div className="p-8 flex-1 flex flex-col">
                <p className="text-[.9rem] text-pz-muted leading-[1.75] mb-6 font-poppins">An intensive, evidence-based program exploring antimicrobial therapy, resistance mechanisms, and rational prescribing for optimal patient outcomes.</p>
                <div className="mb-6">
                  <h4 className="text-[.72rem] font-bold tracking-[.1em] uppercase text-pz-deep font-montserrat mb-3">What You&apos;ll Cover</h4>
                  <ul className="flex flex-col gap-2.5">
                    {AMS_HIGHLIGHTS.map(h => (
                      <li key={h} className="flex items-start gap-2.5 text-[.845rem] text-pz-ink leading-snug font-poppins">
                        <span className="w-5 h-5 shrink-0 rounded-full bg-gradient-to-br from-pz-forest to-pz-mid flex items-center justify-center mt-0.5">
                          <CheckCircle className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                        </span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-4 flex-wrap py-4 border-y border-pz-border mb-6">
                  {[["clock", "6 Weeks"], ["users", "Intermediate"], ["video", "Online + Live"], ["award", "Certificate"]].map(([icon, label]) => (
                    <span key={label} className="flex items-center gap-1.5 text-[.78rem] text-pz-muted font-poppins">
                      {icon === "clock"  && <Clock  className="w-3.5 h-3.5 text-pz-mid" />}
                      {icon === "users"  && <Users  className="w-3.5 h-3.5 text-pz-mid" />}
                      {icon === "video"  && <Video  className="w-3.5 h-3.5 text-pz-mid" />}
                      {icon === "award"  && <Award  className="w-3.5 h-3.5 text-pz-mid" />}
                      {label}
                    </span>
                  ))}
                </div>
                <a href="https://pharmacozyme.com/antimicrobial-stewardship-program/" target="_blank" rel="noopener noreferrer" className="mt-auto block text-center bg-gradient-to-br from-pz-forest to-pz-mid text-white font-montserrat font-bold text-base py-4 rounded-full transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,61,34,.25)] relative overflow-hidden group">
                  <span className="relative z-10">Register for AMS →</span>
                  <span className="absolute inset-0 bg-[rgba(255,255,255,.1)] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

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
              <div key={title} className="group p-8 rounded-2xl border-[1.5px] border-pz-border relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-card-lg hover:border-transparent hover:bg-pz-offwhite after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:bg-gradient-to-r after:from-pz-forest after:to-pz-bright after:scale-x-0 after:origin-left after:transition-transform after:duration-[350ms] hover:after:scale-x-100">
                <div className="w-[52px] h-[52px] rounded-[14px] bg-gradient-to-br from-pz-forest to-pz-mid flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[5deg] group-hover:shadow-[0_8px_20px_rgba(25,75,50,.3)]">
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
      <section className="py-24 px-6 bg-gradient-to-br from-pz-deep to-[#1a4a2e] text-center relative overflow-hidden z-10">
        <div className="absolute inset-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.03)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3C/svg%3E")`, backgroundSize: "60px 104px" }} />
        <div className="relative z-10 max-w-[660px] mx-auto">
          <span className="text-pz-bright text-[.7rem] font-semibold tracking-[.13em] uppercase font-poppins">Take the Next Step</span>
          <h2 className="font-montserrat text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-[1.15] tracking-[-0.015em] mt-3 mb-4">Ready to <em className="not-italic text-pz-bright">Elevate</em> Your<br />Pharmacology Expertise?</h2>
          <p className="text-[rgba(255,255,255,.65)] text-[.97rem] leading-[1.8] mb-10 font-poppins">Secure your spot in the upcoming batch and begin a learning experience that goes far beyond the classroom.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="https://pharmacozyme.com/official-ppc-registration-page/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-8 py-4 rounded-full text-base transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
              <BookOpen className="w-5 h-5" /> Register for PPC
            </a>
            <a href="https://pharmacozyme.com/antimicrobial-stewardship-program/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white border-[1.5px] border-[rgba(255,255,255,.32)] font-poppins font-semibold px-8 py-4 rounded-full text-base transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
              <Shield className="w-5 h-5" /> Register for AMS
            </a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
