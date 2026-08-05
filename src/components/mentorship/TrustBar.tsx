"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BadgeCheck, Quote, ArrowUpRight } from "lucide-react";

export default function TrustBar() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-3" style={{ minHeight: "220px" }}>

      {/* ── Panel 1: Light — Average Rating ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col justify-between"
        style={{
          background: "#F0EDE8",
          padding: "36px 40px",
        }}
      >
        <div>
          <p
            className="font-montserrat mb-4"
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#6B7280",
            }}
          >
            Average Rating
          </p>

          <p
            className="font-montserrat"
            style={{ fontSize: "clamp(48px, 5vw, 64px)", fontWeight: 900, color: "#1A4D2E", lineHeight: 1 }}
          >
            4.9
            <span style={{ color: "#C9A84C", fontSize: "0.55em", verticalAlign: "super", marginLeft: "4px" }}>★</span>
          </p>
        </div>

        <div>
          <div style={{ height: "1px", background: "rgba(0,0,0,0.10)", marginBottom: "16px" }} />
          <p
            className="font-poppins mb-4"
            style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.6, maxWidth: "220px" }}
          >
            Based on verified reviews from mentees across Pakistan.
          </p>
          <div className="flex gap-2">
            <div
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#1A4D2E",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Quote size={14} style={{ color: "#C9A84C" }} />
            </div>
            <div
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "#C9A84C",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <ArrowUpRight size={14} style={{ color: "#1A4D2E" }} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Panel 2: Warm Beige — Feature highlight (matches reference) ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-stretch"
        style={{ background: "#F5E6CB", position: "relative", overflow: "hidden", minHeight: "220px" }}
      >
        {/* Text — left half */}
        <div className="flex flex-col justify-center" style={{ padding: "36px 28px", flex: 1 }}>
          <h3
            className="font-montserrat mb-3"
            style={{ fontSize: "clamp(16px, 1.8vw, 21px)", fontWeight: 800, color: "#1A4D2E", lineHeight: 1.15 }}
          >
            MENTORSHIP<br />MADE PERSONAL
          </h3>
          <p
            className="font-poppins"
            style={{ fontSize: "13px", color: "#5C4A2A", lineHeight: 1.65 }}
          >
            Real guidance, real results. Every session is tailored to your exact goals — no templates, no generic advice.
          </p>
        </div>

        {/* Image — right side, full bleed tall, overflows top */}
        <div style={{ width: "46%", flexShrink: 0, position: "relative", overflow: "visible" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/card-mentorship.png"
            alt="PZ Academy mentee"
            style={{
              position: "absolute",
              bottom: 0,
              right: "-8px",
              height: "125%",
              width: "auto",
              objectFit: "contain",
              objectPosition: "bottom right",
              filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.12))",
            }}
          />
        </div>
      </motion.div>

      {/* ── Panel 3: Dark — Big stat ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col justify-between"
        style={{
          background: "#0D0D0D",
          padding: "36px 40px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Watermark icon */}
        <BadgeCheck
          size={140}
          strokeWidth={0.6}
          style={{
            position: "absolute",
            right: "-20px",
            bottom: "-20px",
            color: "rgba(255,255,255,0.05)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", zIndex: 1 }}>
          <p
            className="font-montserrat"
            style={{ fontSize: "clamp(52px, 5.5vw, 72px)", fontWeight: 900, color: "#C9A84C", lineHeight: 1 }}
          >
            50+
          </p>
          <p
            className="font-montserrat mt-2"
            style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}
          >
            Sessions Booked
          </p>
        </div>

        <p
          className="font-poppins"
          style={{ fontSize: "13px", color: "rgba(255,255,255,0.40)", lineHeight: 1.6, position: "relative", zIndex: 1, maxWidth: "200px" }}
        >
          Verified 1-on-1 mentorship sessions across every major industry.
        </p>
      </motion.div>

    </div>
  );
}
