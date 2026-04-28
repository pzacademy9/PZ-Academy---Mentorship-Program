"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

function NavCTA({ mobile, onClick }: { mobile?: boolean; onClick?: () => void }) {
  const searchParams = useSearchParams();
  const isMentor = searchParams.get("type") === "mentor";

  const label = isMentor ? "Find a Mentor" : "Become a Mentor";
  const href  = isMentor ? "/#mentors"     : "/?type=mentor#apply";

  if (mobile) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className="btn-nav-cta w-full justify-center"
        style={{ display: "flex" }}
      >
        {label}
      </Link>
    );
  }
  return (
    <Link href={href} className="btn-nav-cta">
      {label}
    </Link>
  );
}

const navLinks = [
  { href: "/",          label: "Home" },
  { href: "/#mentors",  label: "Mentors" },
  { href: "/#about",    label: "About" },
  { href: "/#contact",  label: "Contact" },
];

export default function Navbar() {
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? "rgba(26,77,46,0.88)"
          : "rgba(26,77,46,0.72)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: scrolled
          ? "1px solid rgba(201,168,76,0.25)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: scrolled ? "0 8px 32px rgba(0,0,0,0.25)" : "none",
      }}
    >
      <div className="container-max px-6 md:px-8">
        <div className="flex items-center justify-between" style={{ height: "72px" }}>

          {/* ── Logo ── */}
          <Link href="/" className="flex items-center gap-3 group">
            <div style={{ width: 44, height: 44, flexShrink: 0 }}>
              <Image
                src="/pz-logo.png"
                alt="PZ Academy Logo"
                width={44}
                height={44}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col leading-none">
              <span
                className="font-montserrat uppercase"
                style={{ fontWeight: 800, fontSize: "18px", color: "#C9A84C", letterSpacing: "0.12em" }}
              >
                PZ Academy
              </span>
              <span
                className="font-allura"
                style={{ fontSize: "14px", color: "rgba(255,255,255,0.65)", lineHeight: 1.3 }}
              >
                Mentorship Program
              </span>
            </div>
          </Link>

          {/* ── Desktop nav ── */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative font-poppins text-white/80 hover:text-white transition-colors duration-200 group"
                style={{ fontWeight: 500, fontSize: "13px", letterSpacing: "0.15em", textTransform: "uppercase" }}
              >
                {link.label}
                <span
                  className="absolute -bottom-0.5 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-300"
                  style={{ background: "#C9A84C" }}
                />
              </Link>
            ))}
          </nav>

          {/* ── Desktop CTA ── */}
          <div className="hidden md:block">
            <Suspense fallback={<span className="btn-nav-cta">Book a Session</span>}>
              <NavCTA />
            </Suspense>
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 cursor-pointer transition-colors"
            style={{ color: "#C9A84C" }}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mobileOpen ? "x" : "menu"}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {mobileOpen ? <X size={24} /> : <Menu size={24} />}
              </motion.div>
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* ── Mobile menu ── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="md:hidden overflow-hidden"
            style={{
              background: "rgba(26,77,46,0.95)",
              backdropFilter: "blur(18px)",
              borderTop: "1px solid rgba(201,168,76,0.2)",
            }}
          >
            <nav className="flex flex-col px-6 py-5 gap-1">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="block py-3 font-poppins text-white/80 hover:text-white border-b transition-colors"
                    style={{ fontWeight: 500, fontSize: "13px", letterSpacing: "0.15em", textTransform: "uppercase", borderColor: "rgba(255,255,255,0.07)" }}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: navLinks.length * 0.06 }}
                className="pt-4"
              >
                <Suspense fallback={<span className="btn-nav-cta w-full justify-center" style={{ display: "flex" }}>Book a Session</span>}>
                  <NavCTA mobile onClick={() => setMobileOpen(false)} />
                </Suspense>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
