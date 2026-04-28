"use client";

import { Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Star, Users, BadgeCheck, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";

/* ── Floating stat card data ── */
const FLOAT_STATS = [
  {
    icon: <Users size={16} />,
    value: "50+",
    label: "Sessions Booked",
    delay: "0s",
    cls: "levitate-1",
  },
  {
    icon: <Star size={16} fill="currentColor" />,
    value: "4.9★",
    label: "Average Rating",
    delay: "0.8s",
    cls: "levitate-2",
  },
  {
    icon: <BadgeCheck size={16} />,
    value: "100%",
    label: "Verified Experts",
    delay: "1.4s",
    cls: "levitate-3",
  },
];

/* ── Role-aware CTAs ── */
function HeroCTAs() {
  const searchParams = useSearchParams();
  const isMentor = searchParams.get("type") === "mentor";

  const primary      = isMentor
    ? { label: "Apply as a Mentor", href: "/mentorship#apply"   }
    : { label: "Find My Mentor",    href: "/mentorship#mentors" };
  const secondaryLabel = isMentor ? "See mentor benefits"  : "See how it works";
  const trustLine      = isMentor
    ? "Join 15+ verified mentors on the platform"
    : "★ 50+ verified sessions booked across Pakistan";

  return (
    <div className="flex flex-col gap-3">
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Link
          href={primary.href}
          className="group inline-flex items-center justify-between font-montserrat"
          style={{
            background: "#C9A84C",
            color: "#1A4D2E",
            fontWeight: 800,
            fontSize: "12px",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            padding: "15px 24px",
            borderRadius: "4px",
            textDecoration: "none",
            minWidth: "260px",
            gap: "16px",
            boxShadow: "0 4px 20px rgba(201,168,76,0.35)",
          }}
        >
          <span>{primary.label}</span>
          <span
            className="group-hover:translate-x-1 transition-transform"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: "50%",
              background: "rgba(26,77,46,0.15)",
            }}
          >
            <ArrowRight size={12} />
          </span>
        </Link>
      </motion.div>

      <Link
        href="/mentorship#how-it-works"
        className="inline-flex items-center gap-2 font-poppins"
        style={{ fontSize: "13px", color: "#1A4D2E", fontWeight: 500, textDecoration: "none" }}
      >
        <ChevronRight size={14} style={{ color: "#C9A84C" }} />
        {secondaryLabel}
      </Link>

      <p className="font-poppins" style={{ fontSize: "11px", color: "rgba(26,77,46,0.60)", marginTop: "2px" }}>
        {trustLine}
      </p>
    </div>
  );
}

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden" style={{ minHeight: "100vh", background: "#A8CCE0" }}>

      {/* ── Background desktop ── */}
      <div className="absolute inset-0 hidden md:block" style={{ zIndex: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-banner-pc.jpeg"
          alt=""
          aria-hidden="true"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "right top" }}
        />
      </div>

      {/* ── Background mobile ── */}
      <div className="absolute inset-0 block md:hidden" style={{ zIndex: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-banner-mobile.png"
          alt=""
          aria-hidden="true"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "right top" }}
        />
        {/* Mobile-only gradient for text contrast */}
        <div 
          className="absolute inset-0" 
          style={{ 
            background: "linear-gradient(to bottom, rgba(168,204,224,0.7) 0%, rgba(168,204,224,0.3) 40%, transparent 100%)",
            zIndex: 1 
          }} 
        />
      </div>

      {/* ── Content ── */}
      <div className="relative flex flex-col" style={{ minHeight: "100vh", zIndex: 2 }}>

        {/* Main area: text left + floating cards right */}
        <div className="flex-1 relative" style={{ paddingTop: "96px", paddingBottom: "24px" }}>

          {/* Left text column */}
          <div
            className="flex flex-col justify-center h-full px-8 md:px-14 w-full md:max-w-[42vw] lg:max-w-[500px]"
            style={{ paddingTop: "24px" }}
          >
            {/* Label pill */}
            <motion.span
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-2 mb-5 font-poppins self-start"
              style={{
                fontSize: "10px", fontWeight: 600, letterSpacing: "0.22em",
                textTransform: "uppercase", color: "#1A4D2E",
                border: "1px solid rgba(26,77,46,0.40)", borderRadius: "50px",
                padding: "5px 14px",
                background: "rgba(255,255,255,0.60)", backdropFilter: "blur(8px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
              }}
            >
              <Star size={8} fill="#C9A84C" style={{ color: "#C9A84C" }} />
              Pakistan&apos;s Premier Mentorship Platform
            </motion.span>

            {/* Sub-headline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="font-montserrat mb-2"
              style={{
                fontSize: "clamp(11px, 1vw, 15px)", fontWeight: 700,
                letterSpacing: "0.20em", textTransform: "uppercase", color: "#1A4D2E",
                textShadow: "0 1px 8px rgba(255,255,255,0.4)",
              }}
            >
              Connect with your expert.
            </motion.p>

            {/* H1 with shimmer on gold lines */}
            <motion.h1
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="font-montserrat mb-5"
              style={{ fontWeight: 900, lineHeight: 0.92, letterSpacing: "-0.02em" }}
            >
              {/* UNLOCK — dark green with shadow */}
              <span
                className="block"
                style={{
                  fontSize: "clamp(44px, 5.5vw, 78px)",
                  color: "#1A4D2E",
                  textShadow: "0 4px 24px rgba(26,77,46,0.20), 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                UNLOCK
              </span>
              {/* YOUR — gold shimmer */}
              <span
                className="block text-shimmer-gold"
                style={{ fontSize: "clamp(44px, 5.5vw, 78px)" }}
              >
                YOUR
              </span>
              {/* FUTURE. — gold shimmer */}
              <span
                className="block text-shimmer-gold"
                style={{ fontSize: "clamp(44px, 5.5vw, 78px)" }}
              >
                FUTURE.
              </span>
            </motion.h1>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="font-poppins mb-7"
              style={{
                fontSize: "clamp(13px, 1vw, 15px)", lineHeight: 1.75,
                color: "#2D4A38", fontWeight: 400,
              }}
            >
              Personalized 1-on-1 guidance from PZ Academy&apos;s verified industry veterans.
              Build your career, launch your business, or level up your skills.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<div style={{ height: 80 }} />}>
                <HeroCTAs />
              </Suspense>
            </motion.div>

            {/* Mobile stat pills — shown only on mobile */}
            <div className="flex flex-wrap gap-3 mt-8 md:hidden">
              {FLOAT_STATS.map((s) => (
                <div
                  key={s.label}
                  className="inline-flex items-center gap-2"
                  style={{
                    background: "rgba(26,77,46,0.80)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(201,168,76,0.35)",
                    borderRadius: "50px",
                    padding: "7px 14px",
                  }}
                >
                  <span style={{ color: "#C9A84C" }}>{s.icon}</span>
                  <span className="font-montserrat" style={{ fontSize: "13px", fontWeight: 800, color: "#C9A84C" }}>{s.value}</span>
                  <span className="font-poppins" style={{ fontSize: "10px", color: "rgba(255,255,255,0.65)" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Floating stat cards — desktop only, right side ── */}
          <div
            className="hidden md:flex flex-col gap-4 absolute"
            style={{ right: "4%", top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
          >
            {FLOAT_STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.4 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: 1.06, boxShadow: "0 12px 40px rgba(26,77,46,0.35)" }}
                className={s.cls}
                style={{
                  background: "rgba(26,77,46,0.78)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(201,168,76,0.40)",
                  borderRadius: "14px",
                  padding: "14px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  minWidth: "170px",
                  cursor: "default",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                }}
              >
                <div
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(201,168,76,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: "#C9A84C" }}>{s.icon}</span>
                </div>
                <div>
                  <p className="font-montserrat" style={{ fontSize: "20px", fontWeight: 800, color: "#C9A84C", lineHeight: 1 }}>
                    {s.value}
                  </p>
                  <p className="font-poppins" style={{ fontSize: "10px", color: "rgba(255,255,255,0.60)", letterSpacing: "0.05em", marginTop: "2px", textTransform: "uppercase" }}>
                    {s.label}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
