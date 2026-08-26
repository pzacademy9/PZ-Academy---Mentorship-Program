"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Mentor } from "@/lib/data/mentors";
import { formatPrice, initials } from "@/lib/format";
import { MentorTierBadge } from "./MentorTierBadge";

/**
 * "Top Mentors" band, sourced from the Stitch "Top Mentors Featured Band"
 * screen (project 4651274386787527431). Sits between the trust bar and the
 * main grid on /mentorship — visually distinct (dark green, diamond texture)
 * so it reads as a highlight, not a duplicate grid. Only rendered when
 * shouldRenderFeaturedStrip(mentors.length, total) is true (src/lib/mentor-tier.ts),
 * so an all-Standard registry (day one) shows nothing here.
 */
export default function TopMentorsStrip({ mentors }: { mentors: Mentor[] }) {
  return (
    <section
      className="diamond-texture relative overflow-hidden"
      style={{ background: "#1A4D2E", padding: "80px 0" }}
      aria-labelledby="top-mentors-heading"
    >
      <div className="container-max px-6 md:px-8 relative z-10">
        <div className="mb-10">
          <span
            className="font-poppins block mb-2"
            style={{ fontWeight: 700, fontSize: "12px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#C9A84C" }}
          >
            Top Rated
          </span>
          <h2 id="top-mentors-heading" className="font-montserrat" style={{ fontWeight: 800, fontSize: "clamp(28px, 4vw, 44px)", color: "#FFFFFF" }}>
            Top Mentors
          </h2>
          <div style={{ width: "64px", height: "4px", background: "#C9A84C", borderRadius: "9999px", marginTop: "16px" }} />
        </div>

        <div className="flex gap-6 overflow-x-auto pb-4" style={{ scrollbarWidth: "none" }}>
          {mentors.map((mentor, i) => (
            <motion.div
              key={mentor.slug}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: "easeOut" }}
              style={{
                background: "#FFFFFF",
                borderRadius: "16px",
                padding: "24px",
                minWidth: "260px",
                width: "260px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <div className="mb-3">
                <MentorTierBadge tier={mentor.tier} size="md" />
              </div>
              <div className="rounded-full overflow-hidden mb-4" style={{ width: "72px", height: "72px", border: "2px solid #C9A84C" }}>
                {mentor.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mentor.photo}
                    alt={mentor.name}
                    referrerPolicy="no-referrer"
                    className="object-cover object-top w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "#E8F5EE" }} aria-hidden="true">
                    <span className="font-montserrat font-bold" style={{ fontSize: "20px", color: "#1A4D2E" }}>
                      {initials(mentor.name)}
                    </span>
                  </div>
                )}
              </div>
              <h3 className="font-montserrat mb-1" style={{ fontWeight: 700, fontSize: "16px", color: "#0D0D0D" }}>
                {mentor.name}
              </h3>
              <p className="font-poppins mb-4" style={{ fontSize: "12px", color: "#6B7280" }}>
                {mentor.expertise}
              </p>
              <div style={{ width: "100%", height: "1px", background: "#E5E1D8", marginBottom: "16px" }} />
              <p className="font-montserrat mb-4" style={{ fontWeight: 700, fontSize: "14px", color: "#1A4D2E" }}>
                {formatPrice(mentor.pricePerSession)} / session
              </p>
              <Link
                href={`/mentorship/mentors/${mentor.slug}`}
                className="font-poppins inline-flex items-center gap-1 mt-auto"
                style={{ fontSize: "13px", fontWeight: 600, color: "#C9A84C" }}
              >
                View Profile
                <ArrowRight size={13} />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
