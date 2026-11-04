import { Stethoscope, Pill, ShieldCheck } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { NextStep } from "@/components/marketing/NextStep";
import { WhyCards } from "@/components/marketing/kit/WhyCards";
import { getActiveBanners } from "@/lib/data/marketing";
import { batchesNotListed, pickPromo } from "@/lib/marketing/promo";
import { getPublishedCourses } from "@/lib/data/lms";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";

const WHY = [
  { icon: Stethoscope, title: "Expert-led faculty", text: "Learn directly from practising pharmacists and clinical specialists who teach the cases they see." },
  { icon: Pill, title: "Clinically relevant", text: "Every module is built around real patient cases and dose calculation drills, not just textbook theory." },
  { icon: ShieldCheck, title: "SECP certificate", text: "Receive an officially recognised certificate on completion, valued by employers across Pakistan, UAE and KSA." },
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
  const [published, openBatches, banners] = await Promise.all([
    getPublishedCourses("course"),
    getOpenLiveBatches(),
    getActiveBanners("sidebar"),
  ]);
  const courses = attachLiveBatches(published, openBatches);
  const promo = pickPromo({ banners, batches: batchesNotListed(openBatches.values(), published.map((c) => c.id)) });

  return (
    <>
      <MarketingNav />

      <main className="bg-pz-web-surface">
        <CourseCatalogGrid
          courses={courses}
          promo={promo}
          gridId="courses"
          emptyNext={{ label: "Watch a free webinar meanwhile", href: "/webinars" }}
          hero={{
            kicker: "Certified Courses",
            title: <>Explore Our <span className="text-pz-bright">Courses</span></>,
            text: "Expert-led pharmacy modules with a certificate on completion.",
          }}
        />

        <WhyCards
          title="Why study with PZ Academy?"
          text="Built by pharmacists, for pharmacists: real clinical skills, not just certificates."
          cards={WHY}
        />

        <section aria-labelledby="faq-title" className="w-full bg-pz-web-surface px-5 py-16 md:px-6">
          <div className="mx-auto flex max-w-[880px] flex-col gap-8">
            <div className="text-center">
              <h2 id="faq-title" className="font-montserrat text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-pz-deep md:text-[30px]">Frequently Asked Questions</h2>
              <p className="mt-2 font-poppins text-base text-pz-muted">Everything you need to know before you enroll.</p>
            </div>
            <FaqAccordion items={FAQS} />
          </div>
        </section>

        <NextStep
          kicker="Personal career support"
          title="Want 1-on-1 guidance too?"
          text="Secure your spot in the upcoming batch. Want someone to guide you along the way? Book a mentor."
          primary={{ href: "#courses", label: "Explore courses" }}
          next={{ href: "/mentorship#mentors", label: "Next: 1-on-1 Mentorship" }}
        />
      </main>

      <MarketingFooter />
    </>
  );
}
