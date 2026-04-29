"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Star, Users, BadgeCheck, Sparkles, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";

/* ─── Constants ─────────────────────────────────────────── */
// Adjust to your actual navbar height
const NAV_HEIGHT = 72;

const STATS = [
  { icon: Users,      value: "50+",  label: "Sessions Booked",  cls: "levitate-1" },
  { icon: Star,       value: "4.9★", label: "Average Rating",   cls: "levitate-2" },
  { icon: BadgeCheck, value: "100%", label: "Verified Experts", cls: "levitate-3" },
];

const ROLES = ["Doctors", "Engineers", "Pharmacists", "Scientists", "Professionals"];

/* ─── Animated Counter ───────────────────────────────────── */
function Counter({ target }: { target: string }) {
  const num = parseFloat(target);
  const suffix = target.replace(/[\d.]/g, "");
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (isNaN(num)) return;
    let current = 0;
    const timer = setInterval(() => {
      current += num / 45;
      if (current >= num) { setVal(num); clearInterval(timer); }
      else setVal(parseFloat(current.toFixed(1)));
    }, 35);
    return () => clearInterval(timer);
  }, [num]);
  return <>{isNaN(num) ? target : `${val}${suffix}`}</>;
}

/* ─── Typewriter ─────────────────────────────────────────── */
function Typewriter() {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const word = ROLES[idx];
    if (!deleting && text.length < word.length) {
      const t = setTimeout(() => setText(word.slice(0, text.length + 1)), 75);
      return () => clearTimeout(t);
    }
    if (!deleting && text.length === word.length) {
      const t = setTimeout(() => setDeleting(true), 2000);
      return () => clearTimeout(t);
    }
    if (deleting && text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, -1)), 40);
      return () => clearTimeout(t);
    }
    if (deleting && text.length === 0) {
      setDeleting(false);
      setIdx((i) => (i + 1) % ROLES.length);
    }
  }, [text, deleting, idx]);
  return (
    <span style={{ color: "#C9A84C" }}>
      {text}
      <span style={{
        display: "inline-block", width: 2, height: "1em",
        background: "#C9A84C", marginLeft: 3, verticalAlign: "middle",
        animation: "heroBlink 0.75s step-end infinite",
      }} />
    </span>
  );
}

/* ─── Floating Particle ──────────────────────────────────── */
function Particle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: "rgba(201,168,76,0.6)" }}
      animate={{ y: [-8, -36, -8], opacity: [0, 0.7, 0] }}
      transition={{ duration: 3.5 + Math.random() * 2.5, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  x: 2 + Math.random() * 45, y: 15 + Math.random() * 70,
  delay: i * 0.5, size: 2 + Math.random() * 3,
}));

/* ─── CTAs ───────────────────────────────────────────────── */
function HeroCTAs() {
  const searchParams = useSearchParams();
  const isMentor = searchParams.get("type") === "mentor";
  const primary = isMentor
    ? { label: "Apply as a Mentor", href: "/mentorship#apply" }
    : { label: "Find My Mentor",    href: "/mentorship#mentors" };
  const secondaryLabel = isMentor ? "See Mentor Benefits" : "See How It Works";

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
      {/* Primary — gold */}
      <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
        <Link
          href={primary.href}
          className="btn-shimmer-container"
          style={{
            background: "linear-gradient(135deg,#C9A84C 0%,#E8C97A 50%,#C9A84C 100%)",
            backgroundSize: "200% 100%",
            color: "#1A4D2E",
            fontFamily: "var(--font-montserrat),'Montserrat',sans-serif",
            fontWeight: 800, fontSize: "11px",
            letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "16px 28px", borderRadius: "6px",
            textDecoration: "none", minWidth: "220px",
            boxShadow: "0 6px 28px rgba(201,168,76,0.42),inset 0 1px 0 rgba(255,255,255,0.25)",
            display: "inline-flex", justifyContent: "space-between", alignItems: "center",
            gap: 16, position: "relative", overflow: "hidden",
          }}
        >
          <div className="btn-shimmer-effect" />
          <span style={{ position: "relative", zIndex: 1 }}>{primary.label}</span>
          <motion.span
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(26,77,46,0.18)", flexShrink: 0,
            }}
          >
            <ArrowRight size={13} />
          </motion.span>
        </Link>
      </motion.div>

      {/* Secondary — white-tinted, clearly visible on any bg */}
      <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
        <Link
          href="/mentorship#how-it-works"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-montserrat),'Montserrat',sans-serif",
            fontWeight: 700, fontSize: "11px",
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#1A4D2E",
            background: "rgba(255,255,255,0.68)",
            backdropFilter: "blur(12px)",
            border: "1.5px solid rgba(26,77,46,0.28)",
            padding: "15px 24px", borderRadius: "6px",
            textDecoration: "none",
            boxShadow: "0 2px 14px rgba(0,0,0,0.09)",
            whiteSpace: "nowrap",
          }}
        >
          {secondaryLabel}
          <ChevronRight size={14} style={{ color: "#C9A84C" }} />
        </Link>
      </motion.div>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────── */
export default function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY      = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "8%"]);
  const fadeOut  = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  return (
    <>
      <style>{`
        @keyframes heroBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes heroRingPulse {
          0%  { transform:scale(1);   opacity:0.5 }
          100%{ transform:scale(2.4); opacity:0   }
        }
        .hero-stat-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .hero-stat-card:hover {
          transform: translateY(-5px) scale(1.05) !important;
          box-shadow: 0 0 0 1px rgba(201,168,76,0.45),
                      0 20px 50px rgba(26,77,46,0.45),
                      0 0 30px rgba(201,168,76,0.15) !important;
        }
        .hero-ring-pulse  { animation: heroRingPulse 2.4s ease-out infinite; }
        .hero-ring-pulse-2{ animation: heroRingPulse 2.4s ease-out infinite 0.9s; }
      `}</style>

      <section
        ref={ref}
        className="relative overflow-hidden"
        style={{ minHeight: "100dvh", background: "#A8CCE0" }}
      >
        {/* ── Full-bleed parallax BG — desktop ── */}
        <motion.div
          className="absolute inset-0 hidden md:block"
          style={{ zIndex: 0, y: bgY }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-banner-pc.jpeg" alt="" aria-hidden
            style={{ width: "100%", height: "110%", objectFit: "cover", objectPosition: "center center" }}
          />
        </motion.div>

        {/* Left legibility vignette — desktop */}
        <div
          className="absolute inset-y-0 left-0 hidden md:block pointer-events-none"
          style={{
            width: "62%", zIndex: 1,
            background: "linear-gradient(to right,rgba(168,204,224,0.96) 0%,rgba(168,204,224,0.82) 45%,rgba(168,204,224,0.28) 80%,transparent 100%)",
          }}
        />

        {/* Subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            backgroundImage: "linear-gradient(rgba(26,77,46,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(26,77,46,0.04) 1px,transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Particles */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}
        </div>

        {/* ── Scrollable content ── */}
        <motion.div
          className="relative"
          style={{ zIndex: 3, y: contentY, opacity: fadeOut }}
        >
          {/*
           * Layout:
           * • Desktop: single column left-aligned text, vertically centred,
           *   with paddingTop = NAV_HEIGHT so nothing hides behind navbar.
           *   Stat cards float absolutely on the right.
           * • Mobile: stack text → image → pills
           */}
          <div
            className="flex flex-col"
            style={{ minHeight: "100dvh", paddingTop: NAV_HEIGHT }}
          >

            {/* Text block — centred vertically on desktop */}
            <div
              className="flex flex-col justify-center flex-1 px-6 md:px-12 lg:px-16 py-8 md:py-0"
            >
              <div className="md:max-w-[46vw] lg:max-w-[500px]">

                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.55, delay: 0.08 }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20,
                    fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em",
                    textTransform: "uppercase", color: "#1A4D2E",
                    border: "1px solid rgba(26,77,46,0.22)", borderRadius: "50px",
                    padding: "5px 14px",
                    background: "rgba(255,255,255,0.78)", backdropFilter: "blur(12px)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    fontFamily: "var(--font-poppins),'Poppins',sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Sparkles size={8} style={{ color: "#C9A84C", flexShrink: 0 }} />
                  Pakistan&apos;s Premier Mentorship Platform
                </motion.div>

                {/* Headline */}
                <h1
                  className="font-montserrat font-black"
                  style={{
                    fontSize: "clamp(48px,9.5vw,86px)",
                    letterSpacing: "-0.04em",
                    lineHeight: 0.95,
                    marginBottom: "clamp(12px,1.8vw,18px)",
                  }}
                >
                  {["UNLOCK", "YOUR", "FUTURE."].map((word, i) => (
                    <motion.span
                      key={word}
                      className={`block ${i > 0 ? "text-shimmer-gold" : ""}`}
                      style={i === 0 ? { color: "#1A4D2E" } : {}}
                      initial={{ opacity: 0, x: -36 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.62, delay: 0.18 + i * 0.14, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {word}
                    </motion.span>
                  ))}
                </h1>

                {/* Typewriter line */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.62 }}
                  className="font-montserrat font-bold"
                  style={{ fontSize: "clamp(14px,1.7vw,19px)", color: "#1A4D2E", letterSpacing: "-0.01em", marginBottom: 14 }}
                >
                  Expert Mentors for <Typewriter />
                </motion.p>

                {/* Body copy — desktop only */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.72 }}
                  className="font-poppins hidden md:block"
                  style={{
                    fontSize: "clamp(13px,1vw,15px)", lineHeight: 1.8,
                    color: "rgba(26,77,46,0.70)", fontWeight: 400, maxWidth: 400, marginBottom: 28,
                  }}
                >
                  Personalized 1-on-1 guidance from PZ Academy&apos;s verified industry veterans.
                  Build your career, launch your business, or level up your skills.
                </motion.p>

                {/* CTAs */}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.80 }}
                  style={{ marginBottom: 18 }}
                >
                  <Suspense fallback={<div style={{ height: 56 }} />}>
                    <HeroCTAs />
                  </Suspense>
                </motion.div>

                {/* Trust stars */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.02 }}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <div style={{ display: "flex", gap: 1 }}>
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={11} fill="#C9A84C" style={{ color: "#C9A84C" }} />
                    ))}
                  </div>
                  <span className="font-poppins" style={{ fontSize: "11px", color: "rgba(26,77,46,0.58)" }}>
                    50+ verified sessions · Trusted across Pakistan
                  </span>
                </motion.div>

                {/* Mobile stat pills */}
                <div className="flex flex-wrap gap-2 mt-5 md:hidden">
                  {STATS.map(({ icon: Icon, value, label }, i) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.9 + i * 0.1 }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: "rgba(26,77,46,0.85)", backdropFilter: "blur(12px)",
                        border: "1px solid rgba(201,168,76,0.35)",
                        borderRadius: "50px", padding: "7px 14px",
                      }}
                    >
                      <Icon size={12} style={{ color: "#C9A84C" }} />
                      <span className="font-montserrat" style={{ fontSize: "12px", fontWeight: 800, color: "#C9A84C" }}>
                        {value}
                      </span>
                      <span className="font-poppins" style={{ fontSize: "9px", color: "rgba(255,255,255,0.65)" }}>
                        {label}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Mobile hero image — in flow, after text ── */}
            <motion.div
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.85, delay: 0.2 }}
              className="w-[calc(100%+3rem)] -ml-6 relative md:hidden overflow-hidden"
              style={{ height: "50vh", minHeight: "320px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-banner-mobile.png" alt="PZ Academy mentor"
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 25%" }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to bottom,#A8CCE0 0%,rgba(168,204,224,0.65) 5%,transparent 14%,transparent 80%,rgba(168,204,224,0.55) 92%,#A8CCE0 100%)",
                }}
              />
            </motion.div>

          </div>
        </motion.div>

        {/* ── DESKTOP: Floating stat cards ── */}
        <div
          className="hidden md:flex flex-col gap-4 absolute"
          style={{
            right: "3.5%",
            /* vertically centre in the space below the navbar */
            top: `calc(${NAV_HEIGHT}px + (100% - ${NAV_HEIGHT}px) / 2)`,
            transform: "translateY(-50%)",
            zIndex: 10,
          }}
        >
          {STATS.map(({ icon: Icon, value, label, cls }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: 56, filter: "blur(8px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.65, delay: 0.5 + i * 0.13, ease: [0.22, 1, 0.36, 1] }}
              className={`hero-stat-card ${cls}`}
              style={{
                background: "rgba(13,40,25,0.76)",
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(201,168,76,0.38)",
                borderRadius: "16px", padding: "16px 22px",
                display: "flex", alignItems: "center", gap: 14,
                minWidth: "178px", cursor: "default",
                boxShadow: "0 8px 40px rgba(0,0,0,0.22),inset 0 1px 0 rgba(201,168,76,0.10)",
                position: "relative", overflow: "hidden",
              }}
            >
              <div style={{
                position: "absolute", inset: 0, borderRadius: 16, pointerEvents: "none",
                background: "radial-gradient(ellipse 90% 50% at 50% 0%,rgba(201,168,76,0.09) 0%,transparent 70%)",
              }} />
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
              }}>
                <div className="hero-ring-pulse absolute inset-0 rounded-full border border-[rgba(201,168,76,0.28)]" />
                <div className="hero-ring-pulse-2 absolute inset-0 rounded-full border border-[rgba(201,168,76,0.18)]" />
                <Icon size={17} style={{ color: "#C9A84C", position: "relative", zIndex: 1 }} />
              </div>
              <div>
                <p className="font-montserrat" style={{ fontSize: "22px", fontWeight: 900, color: "#C9A84C", lineHeight: 1 }}>
                  <Counter target={value} />
                </p>
                <p className="font-poppins" style={{
                  fontSize: "9px", color: "rgba(255,255,255,0.52)",
                  letterSpacing: "0.09em", marginTop: 3, textTransform: "uppercase",
                }}>
                  {label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ zIndex: 5 }}>
          <svg viewBox="0 0 1440 70" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: "100%", height: 55, display: "block" }}>
            <path d="M0 70L60 62C120 54 240 38 360 34C480 30 600 38 720 44C840 50 960 50 1080 42C1200 34 1320 18 1380 10L1440 2V70H0Z" fill="white" fillOpacity="0.07" />
          </svg>
        </div>

      </section>
    </>
  );
}
