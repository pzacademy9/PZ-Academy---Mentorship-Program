import { Mic, PlayCircle, MessageCircleQuestion } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { WebinarGrid } from "@/components/marketing/WebinarGrid";
import { NextStep } from "@/components/marketing/NextStep";
import { WhyCards } from "@/components/marketing/kit/WhyCards";
import { getPublishedCourses } from "@/lib/data/lms";
import { getActiveBanners } from "@/lib/data/marketing";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { batchesNotListed, pickPromo } from "@/lib/marketing/promo";

const WHY = [
  { icon: Mic, title: "Practising speakers", text: "Sessions led by pharmacists and clinical specialists who work with these cases every day." },
  { icon: MessageCircleQuestion, title: "Ask live", text: "Join a live session and put your own questions to the speaker." },
  { icon: PlayCircle, title: "Watch any time", text: "Missed it? Recordings stay here, so you can catch up at your own pace." },
];

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

      <main className="bg-pz-web-surface">
        <WebinarGrid
          webinars={webinars}
          promo={promo}
          hero={{
            kicker: "Webinar Series",
            title: <>Expert insights, <span className="text-pz-bright">free</span>.</>,
            text: "Join live or watch the recordings any time, led by PZ Academy's clinical faculty.",
          }}
        />

        <WhyCards title="Why join a webinar?" text="The easiest first step into PZ Academy." cards={WHY} />

        <NextStep
          kicker="Your next step"
          title="Ready for hands-on practice?"
          text="Webinars are the first taste. Workshops turn what you heard into skills you can use: guided, practical and short."
          primary={{ href: "#webinars", label: "Browse webinars" }}
          next={{ href: "/workshops", label: "Next: Workshops" }}
        />
      </main>

      <MarketingFooter />
    </>
  );
}
