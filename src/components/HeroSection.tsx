"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Star, Users, BadgeCheck, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";

/* ─── Config ─────────────────────────────────────────────── */
const NAV_HEIGHT = 72;

const STATS = [
  { icon: Users,      value: "50+",  label: "Sessions Booked",  cls: "levitate-1" },
  { icon: Star,       value: "4.9★", label: "Avg Rating",       cls: "levitate-2" },
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
    let cur = 0;
    const timer = setInterval(() => {
      cur += num / 45;
      if (cur >= num) { setVal(num); clearInterval(timer); }
      else setVal(parseFloat(cur.toFixed(1)));
    }, 35);
    return () => clearInterval(timer);
  }, [num]);
  return <>{isNaN(num) ? target : `${val}${suffix}`}</>;
}

/* ─── Typewriter ─────────────────────────────────────────── */
function Typewriter({ dark = false }: { dark?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [del, setDel] = useState(false);
  useEffect(() => {
    const word = ROLES[idx];
    if (!del && text.length < word.length) {
      const t = setTimeout(() => setText(word.slice(0, text.length + 1)), 75);
      return () => clearTimeout(t);
    }
    if (!del && text.length === word.length) {
      const t = setTimeout(() => setDel(true), 2000);
      return () => clearTimeout(t);
    }
    if (del && text.length > 0) {
      const t = setTimeout(() => setText(text.slice(0, -1)), 40);
      return () => clearTimeout(t);
    }
    if (del && text.length === 0) { setDel(false); setIdx(i => (i + 1) % ROLES.length); }
  }, [text, del, idx]);

  /* 
   * FIX 2: On mobile the background is light blue so gold (#C9A84C) is hard to see.
   * Use a darker, more saturated amber-gold + text-shadow for contrast on light bg.
   * On desktop the bg is darker/gradient so standard gold works fine.
   */
  const color = dark ? "#8B6200" : "#C9A84C";
  const shadow = dark ? "0 1px 0 rgba(255,255,255,0.6)" : "none";

  return (
    <span style={{ color, textShadow: shadow, fontWeight: 800 }}>
      {text}
      <span style={{
        display: "inline-block", width: 2, height: "0.9em",
        background: color, marginLeft: 2, verticalAlign: "middle",
        animation: "heroBlink 0.75s step-end infinite",
      }} />
    </span>
  );
}

/* ─── Floating Particle (desktop only) ──────────────────── */
function Particle({ x, y, delay, size }: { x: number; y: number; delay: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none hidden md:block"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: "rgba(201,168,76,0.6)" }}
      animate={{ y: [-8, -36, -8], opacity: [0, 0.7, 0] }}
      transition={{ duration: 3.5 + Math.random() * 2.5, delay, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  x: 2 + Math.random() * 44, y: 15 + Math.random() * 70, delay: i * 0.5, size: 2 + Math.random() * 3,
}));

/* ─── Mobile CTAs ────────────────────────────────────────── */
function MobileCTAs() {
  const searchParams = useSearchParams();
  const isMentor = searchParams.get("type") === "mentor";
  const primary = isMentor
    ? { label: "Apply as a Mentor", href: "/mentorship#apply"   }
    : { label: "Find My Mentor",    href: "/mentorship#mentors" };
  const secondaryLabel = isMentor ? "Mentor Benefits" : "How It Works";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Link
          href={primary.href}
          className="btn-shimmer-container"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, width: "100%",
            background: "linear-gradient(135deg,#C9A84C 0%,#E8C97A 50%,#C9A84C 100%)",
            backgroundSize: "200% 100%", color: "#1A4D2E",
            fontFamily: "var(--font-montserrat),'Montserrat',sans-serif",
            fontWeight: 800, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "13px 18px", borderRadius: "6px", textDecoration: "none",
            boxShadow: "0 4px 20px rgba(201,168,76,0.45),inset 0 1px 0 rgba(255,255,255,0.25)",
            position: "relative", overflow: "hidden",
          }}
        >
          <div className="btn-shimmer-effect" />
          <span style={{ position: "relative", zIndex: 1 }}>{primary.label}</span>
          <motion.span
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 24, height: 24, borderRadius: "50%",
              background: "rgba(26,77,46,0.18)", flexShrink: 0,
            }}
          >
            <ArrowRight size={11} />
          </motion.span>
        </Link>
      </motion.div>

      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Link
          href="/mentorship#how-it-works"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "space-between",
            gap: 8, width: "100%",
            fontFamily: "var(--font-montserrat),'Montserrat',sans-serif",
            fontWeight: 700, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#1A4D2E",
            background: "rgba(255,255,255,0.72)", backdropFilter: "blur(14px)",
            border: "1.5px solid rgba(26,77,46,0.25)",
            padding: "12px 18px", borderRadius: "6px", textDecoration: "none",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          }}
        >
          {secondaryLabel}
          <ChevronRight size={13} style={{ color: "#C9A84C", flexShrink: 0 }} />
        </Link>
      </motion.div>
    </div>
  );
}

/* ─── Desktop CTAs ───────────────────────────────────────── */
function DesktopCTAs() {
  const searchParams = useSearchParams();
  const isMentor = searchParams.get("type") === "mentor";
  const primary = isMentor
    ? { label: "Apply as a Mentor", href: "/mentorship#apply"   }
    : { label: "Find My Mentor",    href: "/mentorship#mentors" };

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
        <Link
          href={primary.href}
          className="btn-shimmer-container"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "space-between",
            gap: 16, minWidth: 220,
            background: "linear-gradient(135deg,#C9A84C 0%,#E8C97A 50%,#C9A84C 100%)",
            backgroundSize: "200% 100%", color: "#1A4D2E",
            fontFamily: "var(--font-montserrat),'Montserrat',sans-serif",
            fontWeight: 800, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "16px 28px", borderRadius: "6px", textDecoration: "none",
            boxShadow: "0 6px 28px rgba(201,168,76,0.42),inset 0 1px 0 rgba(255,255,255,0.25)",
            position: "relative", overflow: "hidden",
          }}
        >
          <div className="btn-shimmer-effect" />
          <span style={{ position: "relative", zIndex: 1 }}>{primary.label}</span>
          <motion.span
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
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

      <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
        <Link
          href="/mentorship#how-it-works"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-montserrat),'Montserrat',sans-serif",
            fontWeight: 700, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase",
            color: "#1A4D2E",
            background: "rgba(255,255,255,0.68)", backdropFilter: "blur(12px)",
            border: "1.5px solid rgba(26,77,46,0.28)",
            padding: "15px 24px", borderRadius: "6px", textDecoration: "none",
            boxShadow: "0 2px 14px rgba(0,0,0,0.09)", whiteSpace: "nowrap",
          }}
        >
          See How It Works
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

  const bgY            = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5, 0.9], [1, 1, 0]);
  const contentY       = useTransform(scrollYProgress, [0.5, 0.9], ["0%", "6%"]);

  return (
    <>
      <style>{`
        @keyframes heroBlink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes heroRingPulse {
          0%  { transform:scale(1);   opacity:0.5 }
          100%{ transform:scale(2.4); opacity:0   }
        }
        .hero-stat-card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
        .hero-stat-card:hover {
          transform: translateY(-5px) scale(1.05) !important;
          box-shadow: 0 0 0 1px rgba(201,168,76,0.45),
                      0 20px 50px rgba(26,77,46,0.45),
                      0 0 30px rgba(201,168,76,0.15) !important;
        }
        .hero-ring-pulse   { animation: heroRingPulse 2.4s ease-out infinite; }
        .hero-ring-pulse-2 { animation: heroRingPulse 2.4s ease-out infinite 0.9s; }
      `}</style>

      <section
        ref={ref}
        className="relative overflow-hidden"
        style={{ minHeight: "100dvh", background: "#A8CCE0" }}
      >

        {/* ══════════════════════════════════
            MOBILE BACKGROUND
            Image is 1080×2400 (portrait 9:20).
            We set the section to exactly 100dvh and let
            the image fill it — no cropping needed on mobile.
        ══════════════════════════════════ */}
        <div
          className="absolute inset-0 md:hidden"
          style={{ zIndex: 0 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-banner-mobile.png"
            alt=""
            aria-hidden
            style={{
              width: "100%",
              height: "100%",
              /*
               * FIX 3: Image is portrait 1080×2400 (9:20 ratio).
               * contain = full image visible, no crop, letterboxed.
               * Since the bg color matches the image bg (#A8CCE0) the
               * letterbox areas are invisible — looks seamless.
               */
              objectFit: "contain",
              objectPosition: "center bottom",
              background: "#A8CCE0",
            }}
          />

          {/* Left text-zone fade — subtle, only ~50% width */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to right, rgba(168,204,224,0.88) 0%, rgba(168,204,224,0.60) 26%, rgba(168,204,224,0.12) 48%, transparent 60%)",
          }} />
          {/* Top — nav area */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to bottom, rgba(168,204,224,0.60) 0%, transparent 18%)",
          }} />
          {/* Bottom — CTA area */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(to top, rgba(168,204,224,0.82) 0%, rgba(168,204,224,0.30) 18%, transparent 32%)",
          }} />
        </div>

        {/* ══════════════════════════════════
            DESKTOP BACKGROUND — parallax
        ══════════════════════════════════ */}
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
        <div
          className="absolute inset-y-0 left-0 hidden md:block pointer-events-none"
          style={{
            width: "62%", zIndex: 1,
            background: "linear-gradient(to right,rgba(168,204,224,0.96) 0%,rgba(168,204,224,0.82) 45%,rgba(168,204,224,0.28) 80%,transparent 100%)",
          }}
        />

        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            backgroundImage: "linear-gradient(rgba(26,77,46,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(26,77,46,0.03) 1px,transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />

        {/* Desktop particles */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}
        </div>

        {/* ══════════════════════════════════
            MOBILE UI — scroll-fade wrapper
        ══════════════════════════════════ */}
        <motion.div
          className="md:hidden"
          style={{
            position: "absolute", inset: 0, zIndex: 4,
            opacity: contentOpacity,
            y: contentY,
          }}
        >
          {/* TOP-LEFT: badge + headline + typewriter */}
          <div
            style={{
              position: "absolute",
              top: NAV_HEIGHT + 14,
              left: 18,
              /* right boundary keeps text off the girl's face */
              right: "46%",
            }}
          >
            {/*
             * FIX 1: Badge on ONE line.
             * Solution: shorten text + force nowrap + reduce font/padding
             * Full text appears as tooltip / aria-label for accessibility.
             */}
            <motion.div
              initial={{ opacity: 0, y: 10, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.5, delay: 0.08 }}
              aria-label="Pakistan's Premier Mentorship Platform"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                marginBottom: 11,
                /* Single line — scale font down so it always fits */
                fontSize: "5.8px",
                fontWeight: 700, letterSpacing: "0.13em",
                textTransform: "uppercase", color: "#1A4D2E",
                border: "1px solid rgba(26,77,46,0.20)", borderRadius: "50px",
                padding: "4px 8px",
                background: "rgba(255,255,255,0.84)", backdropFilter: "blur(12px)",
                boxShadow: "0 1px 8px rgba(0,0,0,0.07)",
                fontFamily: "var(--font-poppins),'Poppins',sans-serif",
                whiteSpace: "nowrap",   /* ← never wrap */
                maxWidth: "100%",
                overflow: "hidden",
              }}
            >
              ✦ Pakistan&apos;s Premier Mentorship Platform
            </motion.div>

            {/* Headline */}
            <h1
              className="font-montserrat font-black"
              style={{
                fontSize: "clamp(32px,10vw,46px)",
                letterSpacing: "-0.04em",
                lineHeight: 0.93,
                marginBottom: 8,
              }}
            >
              {["UNLOCK", "YOUR", "FUTURE."].map((word, i) => (
                <motion.span
                  key={word}
                  className={`block ${i > 0 ? "text-shimmer-gold" : ""}`}
                  style={i === 0 ? { color: "#1A4D2E" } : {}}
                  initial={{ opacity: 0, x: -22 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.55, delay: 0.15 + i * 0.11, ease: [0.22, 1, 0.36, 1] }}
                >
                  {word}
                </motion.span>
              ))}
            </h1>

            {/*
             * FIX 2: "Mentors for X" — typewriter uses dark gold on mobile
             * so it's visible against the light blue background.
             * dark={true} → color "#8B6200" with white text-shadow
             */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.52 }}
              className="font-montserrat font-bold"
              style={{
                fontSize: "11px", color: "#1A4D2E", letterSpacing: "-0.01em",
                /* Extra shadow on the whole line for legibility */
                textShadow: "0 1px 6px rgba(255,255,255,0.55)",
              }}
            >
              Mentors for <Typewriter dark />
            </motion.p>
          </div>

          {/* BOTTOM: CTAs + star trust */}
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: 18, right: 18,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.68 }}
              style={{ display: "flex", flexDirection: "column", gap: 9 }}
            >
              <Suspense fallback={<div style={{ height: 88 }} />}>
                <MobileCTAs />
              </Suspense>

              {/* Stars */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={10} fill="#C9A84C" style={{ color: "#C9A84C" }} />
                ))}
                <span
                  className="font-poppins"
                  style={{
                    fontSize: "9px", color: "rgba(26,77,46,0.85)",
                    fontWeight: 600,
                    textShadow: "0 1px 4px rgba(255,255,255,0.6)",
                  }}
                >
                  50+ sessions · Trusted across Pakistan
                </span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* ══════════════════════════════════
            DESKTOP LAYOUT
        ══════════════════════════════════ */}
        <motion.div
          className="relative hidden md:block"
          style={{ zIndex: 3, y: contentY, opacity: contentOpacity }}
        >
          <div style={{ minHeight: "100dvh", paddingTop: NAV_HEIGHT, display: "flex", alignItems: "center" }}>
            <div style={{ padding: "40px clamp(40px,6vw,80px)" }}>
              <div style={{ maxWidth: "clamp(380px,44vw,500px)" }}>

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
                  ✦&nbsp;Pakistan&apos;s Premier Mentorship Platform
                </motion.div>

                {/* Headline */}
                <h1
                  className="font-montserrat font-black"
                  style={{
                    fontSize: "clamp(52px,9.5vw,88px)",
                    letterSpacing: "-0.04em", lineHeight: 0.95,
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

                {/* Typewriter — desktop uses standard gold */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.62 }}
                  className="font-montserrat font-bold"
                  style={{ fontSize: "clamp(14px,1.7vw,19px)", color: "#1A4D2E", letterSpacing: "-0.01em", marginBottom: 14 }}
                >
                  Expert Mentors for <Typewriter />
                </motion.p>

                {/* Body */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.72 }}
                  className="font-poppins"
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
                    <DesktopCTAs />
                  </Suspense>
                </motion.div>

                {/* Trust */}
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

              </div>
            </div>
          </div>
        </motion.div>

        {/* ── DESKTOP: Floating stat cards ── */}
        <div
          className="hidden md:flex flex-col gap-4 absolute"
          style={{
            right: "3.5%",
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
          <svg viewBox="0 0 1440 70" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"
            style={{ width: "100%", height: 55, display: "block" }}>
            <path d="M0 70L60 62C120 54 240 38 360 34C480 30 600 38 720 44C840 50 960 50 1080 42C1200 34 1320 18 1380 10L1440 2V70H0Z" fill="white" fillOpacity="0.07" />
          </svg>
        </div>

      </section>
    </>
  );
}
