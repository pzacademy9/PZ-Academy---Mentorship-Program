import { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HeroSection from "@/components/HeroSection";
import TrustBar from "@/components/TrustBar";
import MentorCard, { ComingSoonCard } from "@/components/MentorCard";
import RecruitmentForm from "@/components/RecruitmentForm";
import { mentors } from "@/lib/mentors";

export const metadata: Metadata = {
  title: "PZ Academy Mentorship – Find Your Expert Mentor",
  description:
    "Connect with Pakistan's verified industry experts for 1-on-1 mentorship. Browse mentor profiles and book your session today.",
};

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <TrustBar />
        <MentorsSection />
        <HowItWorksSection />
        <RecruitmentForm />
      </main>
      <Footer />
    </>
  );
}

/* ── Mentors Grid ─────────────────────────────────────── */
function MentorsSection() {
  return (
    <section
      id="mentors"
      style={{ background: "#F8F6F1", paddingTop: "100px", paddingBottom: "120px" }}
      aria-labelledby="mentors-heading"
    >
      <div className="container-max px-6 md:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <span className="section-label">Expert Network</span>

          <h2
            id="mentors-heading"
            className="font-montserrat"
            style={{
              fontWeight: 800,
              fontSize: "clamp(32px, 5vw, 52px)",
              color: "#0D0D0D",
              lineHeight: 1.15,
              marginBottom: "14px",
            }}
          >
            Meet Our Mentors
          </h2>
          <div className="gold-divider" />
          <p
            className="font-poppins mx-auto mt-5"
            style={{ fontSize: "18px", color: "#6B7280", maxWidth: "520px", lineHeight: 1.65 }}
          >
            Handpicked industry veterans with proven track records, ready to guide your
            professional journey.
          </p>
        </div>

        {/* Grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: "32px" }}
        >
          {mentors.map((mentor, i) => (
            <MentorCard key={mentor.slug} mentor={mentor} index={i} />
          ))}
          <ComingSoonCard index={mentors.length} />
        </div>
      </div>
    </section>
  );
}

/* ── How It Works ─────────────────────────────────────── */
function HowItWorksSection() {
  const steps = [
    {
      n: "01",
      title: "Submit Booking",
      desc: "Browse mentors, choose your package, and complete the booking form.",
    },
    {
      n: "02",
      title: "Payment Verified",
      desc: "Transfer the fee and upload your screenshot. Admin confirms within 24h.",
    },
    {
      n: "03",
      title: "Get Meeting Link",
      desc: "Your mentor sends a Google Meet or Zoom link to your email.",
    },
    {
      n: "04",
      title: "Attend Session",
      desc: "Join your private 1-on-1 session and start growing.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="diamond-texture"
      style={{ background: "#1A4D2E", padding: "100px 0" }}
      aria-labelledby="how-heading"
    >
      <div className="container-max px-6 md:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <span
            className="section-label"
            style={{ color: "#C9A84C", borderColor: "rgba(201,168,76,0.4)" }}
          >
            The Process
          </span>
          <h2
            id="how-heading"
            className="font-montserrat"
            style={{
              fontWeight: 800,
              fontSize: "clamp(32px, 5vw, 52px)",
              color: "#FFFFFF",
              lineHeight: 1.15,
            }}
          >
            How It Works
          </h2>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Dashed connector line — desktop only */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute"
            style={{
              top: "24px",
              left: "calc(12.5% + 24px)",
              right: "calc(12.5% + 24px)",
              height: "2px",
              borderTop: "2px dashed rgba(201,168,76,0.4)",
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map((step, i) => (
              <div
                key={step.n}
                className="flex flex-col items-center text-center"
                style={{ opacity: 0, animation: `fadeUp 0.6s ease forwards`, animationDelay: `${i * 0.15}s` }}
              >
                {/* Number circle */}
                <div
                  className="relative z-10 flex items-center justify-center mb-5"
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: "#C9A84C",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="font-montserrat"
                    style={{ fontWeight: 800, fontSize: "16px", color: "#1A4D2E" }}
                  >
                    {step.n}
                  </span>
                </div>

                <h3
                  className="font-montserrat mb-2"
                  style={{ fontWeight: 700, fontSize: "18px", color: "#FFFFFF" }}
                >
                  {step.title}
                </h3>
                <p
                  className="font-poppins"
                  style={{
                    fontSize: "14px",
                    color: "rgba(255,255,255,0.65)",
                    lineHeight: 1.6,
                    maxWidth: "200px",
                  }}
                >
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
