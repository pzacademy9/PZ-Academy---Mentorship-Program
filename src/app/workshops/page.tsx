import { FlaskConical, Award, FolderOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { NextStep } from "@/components/marketing/NextStep";
import { WhyCards } from "@/components/marketing/kit/WhyCards";
import { getActiveBanners } from "@/lib/data/marketing";
import { batchesNotListed, pickPromo } from "@/lib/marketing/promo";
import { getPublishedCourses } from "@/lib/data/lms";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";

const WHY = [
  { icon: FlaskConical, title: "Hands-on practice", text: "Work through real clinical cases and live exercises, building the problem-solving reflexes you need on the job." },
  { icon: Award, title: "Certificate of completion", text: "Receive a verified PZ Academy certificate, recognised by academic institutions and healthcare employers." },
  { icon: FolderOpen, title: "Lifetime resources", text: "Keep the workshop materials, session recordings and reference guides to return to any time." },
];

export default async function WorkshopsPage() {
  const [published, openBatches, banners] = await Promise.all([
    getPublishedCourses("workshop"),
    getOpenLiveBatches(),
    getActiveBanners("sidebar"),
  ]);
  const workshops = attachLiveBatches(published, openBatches);
  const promo = pickPromo({ banners, batches: batchesNotListed(openBatches.values(), published.map((w) => w.id)) });

  return (
    <>
      <MarketingNav />

      <main className="bg-pz-web-surface">
        <CourseCatalogGrid
          courses={workshops}
          noun="Workshop"
          promo={promo}
          gridId="workshops"
          emptyNext={{ label: "Watch a free webinar meanwhile", href: "/webinars" }}
          hero={{
            kicker: "Live Workshops",
            title: <>Learn by <span className="text-pz-bright">doing</span></>,
            text: "Short, intensive, hands-on sessions guided by experts who bridge pharmacy theory and clinical practice.",
          }}
        />

        <WhyCards
          title="Why attend a workshop?"
          text="Every PZ Academy workshop leaves you with skills you can use the next day."
          cards={WHY}
        />

        <NextStep
          kicker="Go further"
          title="Ready for the full course?"
          text="Our workshops are open for registration. Want the full picture with a certificate? Courses are the next step."
          primary={{ href: "#workshops", label: "View workshops" }}
          next={{ href: "/courses", label: "Next: Courses" }}
        />
      </main>

      <MarketingFooter />
    </>
  );
}
