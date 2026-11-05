import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { NextStep } from "@/components/marketing/NextStep";
import { PromoSlot } from "@/components/marketing/PromoSlot";
import { MentorshipCatalog } from "@/components/mentorship/MentorshipCatalog";
import { BecomeMentorBand, HowItWorks } from "@/components/mentorship/MentorshipSections";
import { getPublishedMentors } from "@/lib/data/mentors";
import { getMentorReviewSummaries } from "@/lib/data/mentor-reviews";
import { getActiveBanners } from "@/lib/data/marketing";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { pickPromo } from "@/lib/marketing/promo";

export const metadata: Metadata = {
  title: "1-on-1 Mentorship – PZ Academy",
  description: "Book a private 1-on-1 session with a verified pharmacist or health expert. Browse mentor profiles and book your session today.",
};

/** /mentorship, built from the Stitch "1-on-1 Mentorship" and "Mentorship" designs (Platform 2). */
export default async function MentorshipPage() {
  const [mentors, footerBanners, openBatches] = await Promise.all([
    getPublishedMentors(),
    // The promo is optional: a failed read must never break the mentorship page.
    getActiveBanners("footer").catch(() => []),
    getOpenLiveBatches(),
  ]);
  const ratings = await getMentorReviewSummaries(mentors.map((m) => m.id));
  // Above the footer: an admin Footer banner, else an open course batch.
  const promo = pickPromo({ banners: footerBanners, batches: Array.from(openBatches.values()) });

  return (
    <>
      <MarketingNav />
      <main className="bg-pz-web-surface">
        <MentorshipCatalog mentors={mentors} ratings={ratings} />
        <HowItWorks />
        <BecomeMentorBand />
        <PromoSlot promo={promo} />
        <NextStep
          kicker="Prefer learning in a group?"
          title="Looking for group learning instead?"
          text="Join a live workshop or a certified course, taught by the same expert faculty."
          primary={{ href: "/workshops", label: "View workshops" }}
          next={{ href: "/courses", label: "Explore courses" }}
        />
      </main>
      <MarketingFooter />
    </>
  );
}
