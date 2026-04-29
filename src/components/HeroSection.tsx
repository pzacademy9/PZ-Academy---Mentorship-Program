"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ArrowRight, Star, Users, BadgeCheck, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";

/* ─── Particle dot ─────────────────────────────────────── */
function Particle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: "rgba(201,168,76,0.55)" }}
      animate={{ y: [0, -30, 0], opacity: [0, 0.8, 0] }}
      transition={{ duration: 4 + Math.random() * 3, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  x: Math.random() * 50, y: 20 + Math.random() * 70, delay: i * 0.4, size: 2 + Math.random() * 3,
}));

/* ─── Animated counter ─────────────────────────────────── */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = to / 40;
    const timer = setInterval(() => {
      start += step;
      if (start >= to) { setVal(to); clearInterval(timer); }
      else setVal(Math.floor(start));
    }, 40);
    return () => clearInterval(timer);
  }, [to]);
  return <>{val}{suffix}</>;
}

/* ─── Stats ─────────────────────────────────────────────── */
const STATS = [
  { icon: Users,      value: 50,   suffix: "+", label: "Sessions Booked",  delay: 0    },
  { icon: Star,       value: 4.9,  suffix: "★", label: "Average Rating",   delay: 0.12 },
  { icon: BadgeCheck, value: 100,  suffix: "%", label: "Verified Experts", delay: 0.24 },
];

/* ─── Typewriter effect ─────────────────────────────────── */
const ROLES = ["Doctors", "Engineers", "Pharmacists", "Scientists", "Professionals"];
function Typewriter() {
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = ROLES[idx];
    if (!deleting && displayed.length < word.length) {
      const t = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80);
      return () => clearTimeout(t);
    }
    if (!deleting && displayed.length === word.length) {
      const t = setTimeout(() => setDeleting(true), 1800);
      return () => clearTimeout(t);
    }
    if (deleting && displayed.length > 0) {
      const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 45);
      return () => clearTimeout(t);
    }
    if (deleting && displayed.length === 0) {
      setDeleting(false);
      setIdx((i) => (i + 1) % ROLES.length);
    }
  }, [displayed, deleting, idx]);

  return (
    <span className="text-shimmer-gold">
      {displayed}
      <span style={{ borderRight: "3px solid #C9A84C", marginLeft: 2, animation: "blink 0.7s step-end infinite" }} />
    </span>
  );
}

/* ─── Role-aware CTAs ───────────────────────────────────── */
function HeroCTAs() {
  const searchParams = useSearchParams();
  const isMentor = searchParams.get("type") === "mentor";
  const primary = isMentor
    ? { label: "Apply as a Mentor", href: "/mentorship#apply"   }
    : { label: "Find My Mentor",    href: "/mentorship#mentors" };
  const secondaryLabel = isMentor ? "See mentor benefits" : "See how it works";

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
        <Link
          href={primary.href}
          className="btn-shimmer-container group relative inline-flex items-center justify-between gap-4 font-montserrat"
          style={{
            background: "linear-gradient(135deg, #C9A84C 0%, #E8C97A 50%, #C9A84C 100%)",
            backgroundSize: "200% 100%",
            color: "#1A4D2E",
            fontWeight: 800,
            fontSize: "11px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "16px 28px",
            borderRadius: "6px",
            textDecoration: "none",
            minWidth: "240px",
            boxShadow: "0 6px 32px rgba(201,168,76,0.45), inset 0 1px 0 rgba(255,255,255,0.3)",
            transition: "background-position 0.4s ease, box-shadow 0.3s ease",
          }}
        >
          <div className="btn-shimmer-effect" />
          <span className="relative z-10">{primary.label}</span>
          <motion.span
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(26,77,46,0.18)",
            }}
          >
            <ArrowRight size={13} />
          </motion.span>
        </Link>
      </motion.div>

      <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
        <Link
          href="/mentorship#how-it-works"
          className="inline-flex items-center gap-3 font-montserrat"
          style={{
            fontWeight: 700, fontSize: "11px", letterSpacing: "0.12em",
            textTransform: "uppercase", color: "#C9A84C",
            border: "1.5px solid rgba(201,168,76,0.55)",
            padding: "15px 24px", borderRadius: "6px",
            textDecoration: "none",
            background: "rgba(201,168,76,0.06)",
            backdropFilter: "blur(8px)",
            transition: "all 0.25s ease",
          }}
        >
          {secondaryLabel}
          <ArrowRight size={13} />
        </Link>
      </motion.div>
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────── */
export default function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  return (
    <>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes scanline {
          0%{transform:translateY(-100%)}
          100%{transform:translateY(100vh)}
        }
        @keyframes gradientShift {
          0%{background-position:0% 50%}
          50%{background-position:100% 50%}
          100%{background-position:0% 50%}
        }
        @keyframes ringPulse {
          0%{transform:scale(1);opacity:0.6}
          100%{transform:scale(2.2);opacity:0}
        }
        .hero-bg-glow {
          background: radial-gradient(ellipse 70% 60% at 15% 50%, rgba(26,77,46,0.18) 0%, transparent 70%),
                      radial-gradient(ellipse 50% 40% at 70% 60%, rgba(201,168,76,0.12) 0%, transparent 70%);
        }
        .stat-card-glow:hover {
          box-shadow: 0 0 0 1px rgba(201,168,76,0.4), 0 16px 48px rgba(26,77,46,0.4), 0 0 40px rgba(201,168,76,0.15) !important;
          transform: translateY(-4px) scale(1.04) !important;
        }
        .ring-pulse { animation: ringPulse 2.5s ease-out infinite; }
        .ring-pulse-2 { animation: ringPulse 2.5s ease-out infinite 0.8s; }
      `}</style>

      <section
        ref={ref}
        className="relative overflow-hidden"
        style={{ minHeight: "100dvh", background: "#A8CCE0" }}
      >
        {/* Parallax BG — desktop */}
        <motion.div
          className="absolute inset-0 hidden md:block"
          style={{ zIndex: 0, y: bgY }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-banner-pc.jpeg"
            alt=""
            aria-hidden="true"
            style={{ width: "100%", height: "105%", objectFit: "cover", objectPosition: "center bottom" }}
          />
        </motion.div>

        {/* Overlay gradients */}
        <div className="absolute inset-0 hero-bg-glow pointer-events-none" style={{ zIndex: 1 }} />

        {/* Left edge gradient for text legibility */}
        <div
          className="absolute inset-y-0 left-0 hidden md:block pointer-events-none"
          style={{
            width: "55%",
            background: "linear-gradient(to right, rgba(168,204,224,0.92) 0%, rgba(168,204,224,0.70) 55%, transparent 100%)",
            zIndex: 1,
          }}
        />

        {/* Floating particles — left zone */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}
        </div>

        {/* Subtle grid lines */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            zIndex: 1,
            backgroundImage: "linear-gradient(rgba(201,168,76,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.05) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* ── Content ── */}
        <motion.div
          className="relative flex flex-col md:min-h-[100dvh]"
          style={{ zIndex: 3, y: textY, opacity }}
        >
          <div className="flex-1 flex flex-col relative pt-24 md:pt-0 md:min-h-[100dvh]">

            {/* Left text column */}
            <div className="flex-1 flex flex-col justify-center px-6 md:px-14 lg:px-20 w-full md:max-w-[52vw] lg:max-w-[580px]">

              {/* Label pill */}
              <motion.div
                initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="inline-flex items-center gap-2 mb-5 self-start"
                style={{
                  fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: "#1A4D2E",
                  border: "1px solid rgba(26,77,46,0.22)",
                  borderRadius: "50px", padding: "5px 14px",
                  background: "rgba(255,255,255,0.75)", backdropFilter: "blur(12px)",
                  boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
                  whiteSpace: "nowrap",
                }}
              >
                <Sparkles size={8} style={{ color: "#C9A84C" }} />
                Pakistan&apos;s Premier Mentorship Platform
              </motion.div>

              {/* Headline */}
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="font-montserrat font-black leading-[0.95] mb-4"
                style={{ fontSize: "clamp(52px, 10vw, 96px)", letterSpacing: "-0.04em" }}
              >
                {["UNLOCK", "YOUR", "FUTURE."].map((word, i) => (
                  <motion.span
                    key={word}
                    className={`block ${i === 0 ? "text-[#1A4D2E]" : "text-shimmer-gold"}`}
                    initial={{ opacity: 0, x: -40 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.65, delay: 0.22 + i * 0.14, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {word}
                  </motion.span>
                ))}
              </motion.h1>

              {/* Typewriter subtitle */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.65 }}
                className="font-montserrat font-bold mb-4"
                style={{ fontSize: "clamp(14px, 2vw, 20px)", color: "#1A4D2E", letterSpacing: "-0.01em" }}
              >
                Expert Mentors for&nbsp;<Typewriter />
              </motion.div>

              {/* Description */}
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.72 }}
                className="font-poppins mb-8 hidden md:block"
                style={{
                  fontSize: "clamp(13px, 1.1vw, 15px)", lineHeight: 1.8,
                  color: "rgba(26,77,46,0.75)", fontWeight: 400, maxWidth: 420,
                }}
              >
                Personalized 1-on-1 guidance from PZ Academy&apos;s verified industry veterans.
                Build your career, launch your business, or level up your skills.
              </motion.p>

              {/* CTAs */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.8 }}
              >
                <Suspense fallback={<div style={{ height: 56 }} />}>
                  <HeroCTAs />
                </Suspense>
              </motion.div>

              {/* Trust line */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0 }}
                className="flex items-center gap-2 mt-5"
              >
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={11} fill="#C9A84C" style={{ color: "#C9A84C", marginRight: 1 }} />
                  ))}
                </div>
                <span className="font-poppins" style={{ fontSize: "11px", color: "rgba(26,77,46,0.6)" }}>
                  50+ verified sessions · Trusted across Pakistan
                </span>
              </motion.div>

              {/* Mobile stat pills */}
              <div className="flex flex-wrap gap-2 mt-6 md:hidden">
                {STATS.map(({ icon: Icon, value, suffix, label }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.9 + i * 0.1 }}
                    className="inline-flex items-center gap-2"
                    style={{
                      background: "rgba(26,77,46,0.82)", backdropFilter: "blur(12px)",
                      border: "1px solid rgba(201,168,76,0.35)",
                      borderRadius: "50px", padding: "7px 14px",
                    }}
                  >
                    <Icon size={12} style={{ color: "#C9A84C" }} />
                    <span className="font-montserrat" style={{ fontSize: "12px", fontWeight: 800, color: "#C9A84C" }}>
                      {value}{suffix}
                    </span>
                    <span className="font-poppins" style={{ fontSize: "9px", color: "rgba(255,255,255,0.65)" }}>
                      {label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Mobile hero image */}
            <motion.div
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.18 }}
              className="w-[calc(100%+3rem)] -ml-6 relative md:hidden mt-6 overflow-hidden"
              style={{ height: "52vh", minHeight: "360px" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-banner-mobile.png"
                alt=""
                aria-hidden
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to bottom, #A8CCE0 0%, rgba(168,204,224,0.85) 4%, rgba(168,204,224,0.3) 10%, transparent 18%, transparent 82%, rgba(168,204,224,0.5) 92%, #A8CCE0 100%)",
                }}
              />
            </motion.div>
          </div>
        </motion.div>

        {/* ── Desktop floating stat cards ── */}
        <div
          className="hidden md:flex flex-col gap-5 absolute"
          style={{ right: "5%", top: "50%", transform: "translateY(-50%)", zIndex: 10 }}
        >
          {STATS.map(({ icon: Icon, value, suffix, label, delay }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: 60, filter: "blur(8px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, delay: 0.5 + delay, ease: [0.22, 1, 0.36, 1] }}
              className={`stat-card-glow ${["levitate-1","levitate-2","levitate-3"][i]}`}
              style={{
                background: "rgba(13,40,25,0.72)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(201,168,76,0.35)",
                borderRadius: "16px",
                padding: "18px 22px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
                minWidth: "180px",
                cursor: "default",
                boxShadow: "0 8px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(201,168,76,0.12)",
                transition: "transform 0.3s ease, box-shadow 0.3s ease",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* card inner glow */}
              <div style={{
                position: "absolute", inset: 0, borderRadius: 16,
                background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "rgba(201,168,76,0.12)",
                border: "1px solid rgba(201,168,76,0.25)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                position: "relative",
              }}>
                {/* ring pulse behind icon */}
                <div className="ring-pulse absolute inset-0 rounded-full border border-[rgba(201,168,76,0.3)]" />
                <Icon size={17} style={{ color: "#C9A84C", position: "relative", zIndex: 1 }} />
              </div>
              <div>
                <p className="font-montserrat" style={{ fontSize: "24px", fontWeight: 900, color: "#C9A84C", lineHeight: 1 }}>
                  <Counter to={typeof value === "number" ? value : 0} suffix={suffix} />
                </p>
                <p className="font-poppins" style={{
                  fontSize: "9px", color: "rgba(255,255,255,0.55)",
                  letterSpacing: "0.08em", marginTop: "3px", textTransform: "uppercase",
                }}>
                  {label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom wave divider */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ zIndex: 5 }}>
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: "100%", height: 60, display: "block" }}>
            <path d="M0 80L48 68C96 56 192 32 288 24C384 16 480 24 576 36C672 48 768 64 864 64C960 64 1056 48 1152 36C1248 24 1344 16 1392 12L1440 8V80H0Z" fill="white" fillOpacity="0.08" />
            <path d="M0 80L60 72C120 64 240 48 360 44C480 40 600 48 720 52C840 56 960 56 1080 48C1200 40 1320 24 1380 16L1440 8V80H0Z" fill="white" fillOpacity="0.05" />
          </svg>
        </div>
      </section>
    </>
  );
}
