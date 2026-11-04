import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { WebinarGrid } from "@/components/marketing/WebinarGrid";
import { MarketingHero, HERO_BUTTON } from "@/components/marketing/MarketingHero";
import { NextStep } from "@/components/marketing/NextStep";
import { getPublishedCourses } from "@/lib/data/lms";
import { getActiveBanners } from "@/lib/data/marketing";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { batchesNotListed, pickPromo } from "@/lib/marketing/promo";
import { Play } from "lucide-react";

export default async function WebinarsPage() {
  const [webinars, banners, openBatches] = await Promise.all([
    getPublishedCourses("webinar"),
    getActiveBanners("sidebar"),
    getOpenLiveBatches(),
  ]);
  const promo = pickPromo({ banners, batches: batchesNotListed(openBatches.values(), webinars.map((w) => w.id)) });

  return (
    <>
      <MarketingNav />

      <main>
      <MarketingHero
        kicker="Webinar Series"
        title={<>Expert Insights<br /><em className="not-italic text-pz-bright">Straight From</em><br />Clinical Practice</>}
        text="Attend live sessions and revisit expert-led recordings by PZ Academy's faculty — covering pharmacology, therapeutics, and real-world clinical decision-making."
        action={
          <a href="#webinars" className={HERO_BUTTON}>
            <Play className="w-[17px] h-[17px] fill-current" aria-hidden="true" /> Browse Webinars
          </a>
        }
      />

      {/* ─── WEBINAR GRID ─── */}
      <section id="webinars" className="scroll-mt-20 py-16 md:py-24 px-6 bg-pz-offwhite relative z-10">
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center mb-10">
            <span className="text-[.72rem] font-semibold tracking-[.14em] uppercase text-pz-mid font-poppins">Expert-Led Sessions</span>
            <h2 className="font-montserrat text-[clamp(1.8rem,4vw,2.8rem)] font-extrabold text-pz-deep leading-[1.15] mt-2 mb-3">Our Webinar <em className="not-italic text-pz-mid">Faculty</em></h2>
            <p className="text-base text-pz-muted max-w-[560px] mx-auto leading-[1.7] font-poppins">Specialists from across the region. Register for upcoming sessions or revisit recorded webinars at your own pace.</p>
          </div>
          <WebinarGrid webinars={webinars} promo={promo} />
        </div>
      </section>

      <NextStep
        title={<>Ready for <em className="not-italic text-pz-bright">Hands-On</em> Practice?</>}
        text="Webinars are the first taste. Workshops turn what you heard into skills you can use — guided, practical, and short."
        primary={{ href: "#webinars", label: "Browse Webinars" }}
        next={{ href: "/workshops", label: "Next: Workshops" }}
      />
      </main>

      <MarketingFooter />
    </>
  );
}
