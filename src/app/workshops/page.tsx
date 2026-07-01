import Link from "next/link";
import { Users, Award, BookOpen, CheckCircle, Clock, Wrench, Activity } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const BENEFITS = [
  { icon: Users,    title: "Expert-Led Instruction",   desc: "Learn directly from Dr. Mehwish Kanwal — an experienced pharmaceutical educator who breaks complex dosing concepts into clinically relevant, easy-to-apply methods." },
  { icon: Wrench,   title: "Hands-On Practice",        desc: "Work through real-world clinical cases and live calculations — building the problem-solving reflexes and muscle memory you need in actual clinical settings." },
  { icon: Activity, title: "Clinical Confidence",      desc: "Leave with measurable confidence in dose calculations — one of the highest-stakes skills in pharmacy. Eliminate guesswork and prevent calculation errors permanently." },
  { icon: Award,    title: "Certificate of Completion",desc: "Receive a verified PZ Academy certificate upon completion — a credential recognised by academic institutions and healthcare employers across Pakistan, UAE, and KSA." },
  { icon: Users,    title: "Peer Networking",          desc: "Connect with pharmacy students and professionals from across the region. Build a professional community that supports your entire academic and clinical career." },
  { icon: BookOpen, title: "Lifetime Resources",       desc: "Access all workshop materials, session recordings, and reference guides — study aids you can return to throughout your entire pharmaceutical education journey." },
];

export default function WorkshopsPage() {
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
            Live Workshop — Seats Filling Fast
          </div>
          <h1 className="font-montserrat text-[clamp(1.9rem,6vw,4.25rem)] font-extrabold text-white leading-[1.08] tracking-[-0.02em]">
            Elevate Your Skills<br /><em className="not-italic text-pz-bright">Through Expert-Led</em><br />Workshops
          </h1>
          <p className="text-[clamp(.95rem,1.6vw,1.1rem)] text-[rgba(255,255,255,.62)] max-w-[560px] mx-auto mt-5 mb-10 leading-[1.75] font-poppins">
            Intensive, hands-on workshops bridging the gap between pharmaceutical theory and clinical practice — guided by industry experts who&apos;ve been there.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <a href="#workshops" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-7 py-3 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
              <Wrench className="w-[17px] h-[17px]" /> View Workshops
            </a>
            <a href="https://pharmacozyme.com/mdc-2-dr-mehwish-kanwal/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-white border-[1.5px] border-[rgba(255,255,255,.32)] font-poppins font-semibold px-7 py-3 rounded-full transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
              <CheckCircle className="w-[17px] h-[17px]" /> Register for MDC
            </a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[rgba(255,255,255,.3)] text-[.68rem] tracking-[.12em] uppercase z-10">
          <div className="w-px h-[38px] bg-gradient-to-b from-[rgba(255,255,255,.35)] to-transparent animate-[scrollLine_1.6s_ease-in-out_infinite]" />
          <span>Scroll</span>
        </div>
      </section>

      {/* ─── WORKSHOP CARD ─── */}
      <section id="workshops" className="py-24 px-6 bg-pz-offwhite relative z-10">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid font-poppins">Current Workshop</span>
            <h2 className="font-montserrat text-[clamp(1.7rem,3vw,2.5rem)] font-extrabold text-pz-deep leading-[1.18] mt-2 mb-3">Now <em className="not-italic text-pz-mid">Enrolling</em></h2>
            <p className="text-[.97rem] text-pz-muted max-w-[520px] mx-auto leading-[1.75] font-poppins">Secure your spot in our featured workshop led by an expert instructor. Limited seats — register before they&apos;re gone.</p>
          </div>

          {/* MDC Card */}
          <div className="rounded-3xl overflow-hidden border-[1.5px] border-pz-border shadow-card-lg transition-all duration-400 hover:-translate-y-2.5 hover:shadow-[0_28px_72px_rgba(15,61,34,.22)]">
            {/* Card top */}
            <div className="bg-gradient-to-br from-pz-deep to-pz-forest p-10 md:p-14 relative overflow-hidden">
              <div className="absolute w-[300px] h-[300px] rounded-full bg-[rgba(126,217,87,.06)] -top-[120px] -right-[80px]" />
              <div className="absolute w-[180px] h-[180px] rounded-full bg-[rgba(126,217,87,.04)] -bottom-[70px] left-[38%]" />
              {/* Hex bg pattern */}
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.04)' stroke-width='1' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3C/svg%3E")`, backgroundSize: "60px 104px" }} />

              <div className="relative z-10">
                <div className="flex flex-wrap gap-2 mb-8">
                  {["Enrolling Now", "Season 2", "Certificate Included"].map((badge, i) => (
                    <span key={badge} className={`text-[.67rem] font-bold uppercase tracking-[.09em] px-3 py-1 rounded-full ${
                      i === 0 ? "bg-[rgba(126,217,87,.18)] border border-[rgba(126,217,87,.4)] text-pz-bright" :
                      i === 1 ? "bg-[rgba(255,255,255,.1)] border border-[rgba(255,255,255,.2)] text-[rgba(255,255,255,.8)]" :
                      "bg-[rgba(201,150,10,.15)] border border-[rgba(201,150,10,.35)] text-pz-gold"
                    }`}>{badge}</span>
                  ))}
                </div>

                <div className="flex items-baseline gap-4 mb-6">
                  <span className="font-montserrat text-[4rem] font-black text-pz-bright leading-none tracking-[-0.02em]">MDC</span>
                  <span className="font-montserrat text-[clamp(1.4rem,3vw,2rem)] font-extrabold text-white leading-[1.1]">Mastering Dose<br />Calculations</span>
                </div>

                <p className="text-[rgba(255,255,255,.72)] text-[.97rem] leading-[1.75] max-w-[600px] mb-8 font-poppins">
                  An intensive, hands-on workshop covering the full spectrum of pharmaceutical dose calculations — from foundational arithmetic to complex weight-based, renal-adjusted, and pediatric dosing.
                </p>

                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pz-bright to-pz-pale flex items-center justify-center font-montserrat font-black text-pz-deep text-sm">MK</div>
                  <div>
                    <div className="text-[.72rem] uppercase tracking-[.1em] text-[rgba(255,255,255,.5)] font-poppins">Workshop Instructor</div>
                    <div className="text-white font-semibold font-poppins">Dr. Mehwish Kanwal</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card bottom */}
            <div className="bg-white px-10 md:px-14 py-8 flex flex-wrap items-center justify-between gap-6 transition-colors duration-250">
              <div className="flex flex-wrap gap-6">
                {[
                  [Wrench, "Hands-On Format"],
                  [Users,  "Limited Seats"],
                  [Clock,  "Live & Interactive"],
                  [Award,  "Verified Certificate"],
                ].map(([Icon, label]) => (
                  <span key={String(label)} className="flex items-center gap-2 text-[.82rem] text-pz-muted font-poppins">
                    <span className="w-8 h-8 rounded-full bg-pz-offwhite flex items-center justify-center">
                      {/* @ts-ignore */}
                      <Icon className="w-4 h-4 text-pz-mid" />
                    </span>
                    {String(label)}
                  </span>
                ))}
              </div>
              <a
                href="https://pharmacozyme.com/mdc-2-dr-mehwish-kanwal/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-montserrat font-bold px-8 py-3.5 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.35)] shrink-0"
              >
                Register Now
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── BENEFITS ─── */}
      <section className="py-24 px-6 bg-white relative z-10">
        <div className="max-w-[1060px] mx-auto">
          <div className="text-center mb-14">
            <span className="text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid font-poppins">Why Attend</span>
            <h2 className="font-montserrat text-[clamp(1.7rem,3vw,2.5rem)] font-extrabold text-pz-deep leading-[1.18] mt-2 mb-3">Benefits of <em className="not-italic text-pz-mid">Attending</em></h2>
            <p className="text-[.97rem] text-pz-muted max-w-[520px] mx-auto leading-[1.75] font-poppins">Every PZ Academy workshop delivers tangible, lasting results for your clinical confidence and academic career.</p>
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

      {/* ─── CTA ─── */}
      <section className="py-24 px-6 bg-gradient-to-br from-pz-deep to-[#1a4a2e] text-center relative overflow-hidden z-10">
        <div className="absolute inset-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.03)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3C/svg%3E")`, backgroundSize: "60px 104px" }} />
        <div className="relative z-10 max-w-[600px] mx-auto">
          <h2 className="font-montserrat text-[clamp(1.9rem,3.5vw,2.8rem)] font-extrabold text-white leading-[1.15] mb-4">Ready to Master<br /><em className="not-italic text-pz-bright">Dose Calculations?</em></h2>
          <p className="text-[rgba(255,255,255,.65)] text-[.97rem] leading-[1.8] mb-10 font-poppins">MDC Season 2 with Dr. Mehwish Kanwal is open for registration. Seats are strictly limited — secure yours before they&apos;re gone.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="https://pharmacozyme.com/mdc-2-dr-mehwish-kanwal/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-8 py-4 rounded-full text-base transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
              Register for MDC Now
            </a>
            <Link href="/" className="inline-flex items-center gap-2 text-white border-[1.5px] border-[rgba(255,255,255,.32)] font-poppins font-semibold px-8 py-4 rounded-full text-base transition-all duration-200 hover:border-pz-bright hover:text-pz-bright hover:-translate-y-0.5">
              Back to Home
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
