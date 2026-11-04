import { Users, Award, BookOpen, Wrench, Activity } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CourseCatalogGrid } from "@/components/marketing/CourseCatalogGrid";
import { MarketingHero, HERO_BUTTON } from "@/components/marketing/MarketingHero";
import { NextStep } from "@/components/marketing/NextStep";
import { getActiveBanners } from "@/lib/data/marketing";
import { batchesNotListed, pickPromo } from "@/lib/marketing/promo";
import { getPublishedCourses } from "@/lib/data/lms";
import { getOpenLiveBatches } from "@/lib/data/landing-website";
import { attachLiveBatches } from "@/lib/data/live-batch-merge";

const BENEFITS = [
  { icon: Users,    title: "Expert-Led Instruction",   desc: "Learn directly from experienced pharmaceutical educators who break complex concepts into clinically relevant, easy-to-apply methods." },
  { icon: Wrench,   title: "Hands-On Practice",        desc: "Work through real-world clinical cases and live exercises — building the problem-solving reflexes and muscle memory you need in actual clinical settings." },
  { icon: Activity, title: "Clinical Confidence",      desc: "Leave with measurable confidence in high-stakes clinical skills. Eliminate guesswork and prevent errors permanently." },
  { icon: Award,    title: "Certificate of Completion",desc: "Receive a verified PZ Academy certificate upon completion — a credential recognised by academic institutions and healthcare employers across Pakistan, UAE, and KSA." },
  { icon: Users,    title: "Peer Networking",          desc: "Connect with pharmacy students and professionals from across the region. Build a professional community that supports your entire academic and clinical career." },
  { icon: BookOpen, title: "Lifetime Resources",       desc: "Access all workshop materials, session recordings, and reference guides — study aids you can return to throughout your entire pharmaceutical education journey." },
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

      <main>
      <MarketingHero
        kicker="Live Workshops"
        title={<>Elevate Your Skills<br /><em className="not-italic text-pz-bright">Through Expert-Led</em><br />Workshops</>}
        text="Intensive, hands-on workshops bridging the gap between pharmaceutical theory and clinical practice — guided by industry experts who've been there."
        action={
          <a href="#workshops" className={HERO_BUTTON}>
            <Wrench className="w-[17px] h-[17px]" aria-hidden="true" /> View Workshops
          </a>
        }
      />

      {/* ─── WORKSHOPS ─── */}
      <section id="workshops" className="scroll-mt-20 py-16 md:py-24 px-6 bg-pz-offwhite relative z-10">
        <div className="max-w-[1180px] mx-auto">
          <div className="text-center mb-14">
            <span className="text-[.7rem] font-semibold tracking-[.13em] uppercase text-pz-mid font-poppins">Current Workshops</span>
            <h2 className="font-montserrat text-[clamp(1.7rem,3vw,2.5rem)] font-extrabold text-pz-deep leading-[1.18] mt-2 mb-3">Now <em className="not-italic text-pz-mid">Enrolling</em></h2>
            <p className="text-[.97rem] text-pz-muted max-w-[520px] mx-auto leading-[1.75] font-poppins">Secure your spot in a featured workshop led by an expert instructor. Limited seats — register before they&apos;re gone.</p>
          </div>

          <CourseCatalogGrid
            courses={workshops}
            noun="Workshop"
            promo={promo}
            emptyNext={{ label: "Watch a free webinar meanwhile", href: "/webinars" }}
          />
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

      <NextStep
        title={<>Ready to Level Up<br /><em className="not-italic text-pz-bright">Your Skills?</em></>}
        text="Our workshops are open for registration. Want the full picture with a certificate? Courses are the next step."
        primary={{ href: "#workshops", label: "View Workshops" }}
        next={{ href: "/courses", label: "Next: Courses" }}
      />
      </main>

      <MarketingFooter />
    </>
  );
}
