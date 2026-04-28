"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Home } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-brand-green flex flex-col items-center justify-center relative overflow-hidden px-6 py-32">
        {/* Animated background */}
        <div className="absolute inset-0 hero-bg-pattern" aria-hidden="true" />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(46,125,82,0.3) 0%, transparent 70%)" }}
          aria-hidden="true"
        />

        {/* Floating diamonds */}
        {[80, 120, 50].map((size, i) => (
          <motion.div
            key={i}
            className="absolute pointer-events-none opacity-5"
            style={{
              width: size,
              height: size,
              top: `${20 + i * 25}%`,
              left: `${10 + i * 30}%`,
            }}
            animate={{ y: [0, -20, 0], rotate: [0, 20, 0] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
          >
            <div
              className="w-full h-full bg-brand-gold"
              style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
            />
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 text-center"
        >
          {/* 404 */}
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 100 }}
            className="font-montserrat font-black text-[8rem] md:text-[12rem] text-brand-gold/20 leading-none mb-2 select-none"
            aria-hidden="true"
          >
            404
          </motion.div>

          <h1 className="font-montserrat font-black text-3xl md:text-4xl text-white mb-4 -mt-8">
            Page Not Found
          </h1>
          <p className="font-poppins text-white/60 text-base mb-10 max-w-md mx-auto leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved. Let&apos;s get you back on track.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/mentorship" className="btn-primary group">
              <Home size={16} />
              Go to Home
            </Link>
            <Link href="/mentorship#mentors" className="btn-secondary group">
              Browse Mentors
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>

          {/* Decorative allura */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="font-allura text-brand-gold/40 text-2xl mt-12"
          >
            PZ Academy Mentorship
          </motion.p>
        </motion.div>
      </main>
      <Footer />
    </>
  );
}
