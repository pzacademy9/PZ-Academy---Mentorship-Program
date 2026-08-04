import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { WebinarGrid } from "@/components/marketing/WebinarGrid";
import { getPublishedCourses } from "@/lib/data/lms";
import { Play } from "lucide-react";

export default async function WebinarsPage() {
  const webinars = await getPublishedCourses("webinar");

  return (
    <>
      <MarketingNav />

      {/* ─── HERO ─── */}
      <section className="relative min-h-screen flex items-center justify-center text-center overflow-hidden bg-pz-deep">
        <div className="absolute inset-0 opacity-75" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C3 57%2C18 57%2C48 30%2C63 3%2C48 3%2C18'/%3E%3Cpolygon fill='none' stroke='rgba(255%2C255%2C255%2C0.045)' stroke-width='1.2' points='30%2C63 57%2C78 57%2C104 3%2C104 3%2C78'/%3E%3C/svg%3E")`, backgroundSize: "60px 104px" }} />
        <div className="absolute w-[600px] h-[600px] rounded-full bg-pz-bright opacity-[.07] blur-[90px] -top-[180px] -right-[120px] animate-[orbFloat1_12s_ease-in-out_infinite] pointer-events-none" />
        <div className="absolute w-[450px] h-[450px] rounded-full bg-pz-mid opacity-[.13] blur-[90px] -bottom-20 -left-20 animate-[orbFloat2_15s_ease-in-out_infinite] pointer-events-none" />

        <div className="relative z-10 max-w-[780px] px-6 pt-28 pb-16">
          <div className="inline-flex items-center gap-2 bg-[rgba(126,217,87,.1)] border border-[rgba(126,217,87,.28)] text-pz-bright text-[.72rem] font-semibold tracking-[.1em] uppercase px-4 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-pz-bright rounded-full animate-[pls_2s_ease-in-out_infinite]" />
            Webinar Series
          </div>
          <h1 className="font-montserrat text-[clamp(1.9rem,6vw,4.25rem)] font-extrabold text-white leading-[1.08] tracking-[-0.02em]">
            Expert Insights<br /><em className="not-italic text-pz-bright">Straight From</em><br />Clinical Practice
          </h1>
          <p className="text-[clamp(.95rem,1.6vw,1.1rem)] text-[rgba(255,255,255,.62)] max-w-[560px] mx-auto mt-5 leading-[1.75] font-poppins">
            Attend live sessions and revisit expert-led recordings by PZ Academy&apos;s faculty — covering pharmacology, therapeutics, and real-world clinical decision-making.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap mt-10">
            <a href="#webinars" className="inline-flex items-center gap-2 bg-pz-bright text-pz-forest font-poppins font-bold px-7 py-3 rounded-full transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(126,217,87,.3)]">
              <Play className="w-[17px] h-[17px] fill-current" /> Browse Webinars
            </a>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-[rgba(255,255,255,.3)] text-[.68rem] tracking-[.12em] uppercase z-10">
          <div className="w-px h-[38px] bg-gradient-to-b from-[rgba(255,255,255,.35)] to-transparent animate-[scrollLine_1.6s_ease-in-out_infinite]" />
          <span>Scroll</span>
        </div>
      </section>

      {/* ─── WEBINAR GRID ─── */}
      <section id="webinars" className="py-24 px-6 bg-pz-offwhite relative z-10">
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center mb-10">
            <span className="text-[.72rem] font-semibold tracking-[.14em] uppercase text-pz-mid font-poppins">Expert-Led Sessions</span>
            <h2 className="font-montserrat text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold text-pz-deep leading-[1.15] mt-2 mb-3">Our Webinar <em className="not-italic text-pz-mid">Faculty</em></h2>
            <p className="text-base text-pz-muted max-w-[560px] mx-auto leading-[1.7] font-poppins">Specialists from across the region. Register for upcoming sessions or revisit recorded webinars at your own pace.</p>
          </div>
          <WebinarGrid webinars={webinars} />
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
