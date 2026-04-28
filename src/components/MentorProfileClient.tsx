"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle, Clock, Video, Globe, Banknote,
  Package, Calendar, Timer, ArrowRight, MessageCircle,
  GraduationCap, Award, BookOpen, Lightbulb, TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { type Mentor, formatPrice } from "@/lib/mentors";
import { whatsappLink } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  GraduationCap, Award, BookOpen, Lightbulb, TrendingUp,
};

const sessionDetailRows = (mentor: Mentor) => [
  { icon: Clock, label: "Duration", value: "60 Minutes" },
  { icon: Video, label: "Format", value: mentor.format },
  { icon: Globe, label: "Languages", value: mentor.language },
  {
    icon: Banknote,
    label: "Single Session",
    value: "PKR XXXXX",
    highlight: true,
  },
  {
    icon: Package,
    label: "Packages",
    value: mentor.packages
      .filter((p) => p.sessions > 1)
      .map((p) => `${p.sessions} session${p.sessions > 1 ? "s" : ""} – PKR XXXXX`)
      .join(" | "),
  },
  { icon: Calendar, label: "Availability", value: mentor.availability },
  { icon: Timer, label: "Lead Time", value: mentor.leadTime },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

export default function MentorProfileClient({ mentor }: { mentor: Mentor }) {
  const waMsg = `Hi! I'd like to book a session with ${mentor.name} on PZ Academy.`;
  const rows = sessionDetailRows(mentor);

  return (
    <>
      {/* ── Hero ── */}
      <section
        className="relative bg-white border-b border-gray-100 pt-20 overflow-hidden"
        aria-label={`${mentor.name} profile`}
      >
        {/* Background gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(26,77,46,0.04) 0%, transparent 60%), linear-gradient(to bottom, rgba(201,168,76,0.03) 0%, transparent 100%)",
          }}
          aria-hidden="true"
        />

        <div className="container-max px-6 md:px-8 py-16">
          <div className="flex flex-col md:flex-row gap-12 lg:gap-16 items-start">
            {/* Photo */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7 }}
              className="w-full md:w-[38%] flex-shrink-0"
            >
              <div className="relative w-full max-w-sm mx-auto aspect-[3/4] rounded-2xl overflow-hidden border-2 border-brand-gold/20 shadow-gold-md bg-gray-50">
                <Image
                  src={mentor.photo}
                  alt={`${mentor.name} – ${mentor.expertise} mentor at PZ Academy`}
                  fill
                  className="object-cover object-top"
                  sizes="(max-width: 768px) 90vw, 400px"
                  priority
                />
                {/* Verified badge */}
                <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-brand-gold text-brand-green px-3 py-1.5 rounded-full shadow-lg text-xs font-montserrat font-bold uppercase tracking-wider">
                  <CheckCircle size={14} strokeWidth={2.5} />
                  Verified
                </div>
              </div>
            </motion.div>

            {/* Details */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="w-full md:w-[62%] flex flex-col pt-2"
            >
              <motion.div variants={fadeUp}>
                  href="/mentorship"
                  className="inline-flex items-center gap-1 text-xs font-poppins text-gray-400 hover:text-brand-green transition-colors mb-4 group"
                >
                  <ArrowRight size={12} className="rotate-180 group-hover:-translate-x-1 transition-transform" />
                  Back to Home
                </Link>
              </motion.div>

              <motion.div variants={fadeUp}>
                <span className="inline-block px-3 py-1 bg-brand-green-mid/10 text-brand-green-mid font-poppins text-xs uppercase tracking-widest rounded-full mb-4">
                  {mentor.expertise}
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-montserrat font-black text-4xl md:text-5xl text-brand-black tracking-tight mb-2"
              >
                {mentor.name}
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="font-poppins text-lg text-brand-green-mid font-semibold tracking-wide mb-6"
              >
                {mentor.title}
              </motion.p>

              {/* Badges */}
              <motion.div variants={fadeUp} className="flex flex-wrap gap-2 mb-8">
                {[
                  { label: mentor.experience, icon: "💼" },
                  { label: mentor.domain, icon: "🌐" },
                  { label: mentor.language, icon: "💬" },
                  { label: "Online", icon: "🖥️" },
                ].map(({ label, icon }) => (
                  <span
                    key={label}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 border border-gray-200 text-gray-700 font-poppins text-xs rounded-full"
                  >
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </span>
                ))}
              </motion.div>

              {/* Price highlight */}
              <motion.div
                variants={fadeUp}
                className="flex items-baseline gap-2 mb-8"
              >
                <span className="font-montserrat font-black text-3xl text-brand-green">
                  {"PKR XXXXX"}
                </span>
                <span className="font-poppins text-sm text-gray-400">/ session</span>
                <span className="ml-2 font-poppins text-xs text-brand-gold bg-brand-gold/10 border border-brand-gold/30 px-2 py-0.5 rounded-full">
                  Packages available
                </span>
              </motion.div>

              {/* CTAs */}
              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Link
                    href={`/mentorship/book/${mentor.slug}`}
                    className="btn-primary group"
                  >
                    Book a Session
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <a
                    href={whatsappLink(waMsg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-whatsapp"
                  >
                    <MessageCircle size={16} />
                    WhatsApp Me First
                  </a>
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="section-padding bg-white">
        <div className="container-max px-6 md:px-8">
          <div className="flex flex-col lg:flex-row gap-14">
            {/* LEFT: Bio + Skills + Credentials */}
            <div className="w-full lg:w-[62%] space-y-12">
              {/* Bio */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 w-1 h-full bg-brand-gold rounded-l-2xl" aria-hidden="true" />
                <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-5">
                  About {mentor.name}
                </h2>
                <div className="space-y-4 font-poppins text-base text-gray-600 leading-relaxed">
                  {mentor.fullBio.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              </motion.div>

              {/* Core Skills */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-5">
                  Core Expertise
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mentor.skills.map((skill) => (
                    <div
                      key={skill}
                      className="flex items-start gap-3 bg-gray-50 hover:bg-brand-green/5 border border-gray-100 hover:border-brand-gold/30 p-4 rounded-xl transition-colors duration-200 cursor-default group"
                    >
                      <CheckCircle
                        size={18}
                        className="text-brand-gold flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform"
                        strokeWidth={2}
                      />
                      <span className="font-poppins text-sm text-gray-800">{skill}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Credentials */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-5">
                  Credentials & Certifications
                </h2>
                <div className="flex flex-wrap gap-4">
                  {mentor.credentials.map((cred) => {
                    const Icon = iconMap[cred.icon] ?? Award;
                    return (
                      <div
                        key={cred.title}
                        className="flex items-center gap-3 bg-gray-50 border border-brand-gold/20 hover:border-brand-gold/60 p-4 rounded-xl transition-colors min-w-[190px] cursor-default"
                      >
                        <Icon size={28} className="text-brand-gold flex-shrink-0" strokeWidth={1.5} />
                        <div>
                          <div className="font-montserrat font-bold text-xs uppercase tracking-wide text-brand-black">
                            {cred.title}
                          </div>
                          <div className="font-poppins text-xs text-gray-500 mt-0.5">
                            {cred.institution}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* How It Works Timeline */}
              <HowItWorksTimeline />
            </div>

            {/* RIGHT: Sticky Session Details */}
            <div className="w-full lg:w-[38%]">
              <div className="sticky top-28">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
                >
                  {/* Header */}
                  <div className="bg-brand-green px-6 py-5 border-l-4 border-l-brand-gold">
                    <h3 className="font-montserrat font-bold text-lg text-white">
                      Session Details
                    </h3>
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-gray-100">
                    {rows.map((row, i) => {
                      const Icon = row.icon;
                      return (
                        <div
                          key={row.label}
                          className={`flex items-start gap-3 px-6 py-4 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-gray-50 transition-colors`}
                        >
                          <Icon size={15} className="text-brand-gold flex-shrink-0 mt-0.5" strokeWidth={2} />
                          <div className="flex-1 min-w-0">
                            <div className="font-poppins text-xs text-gray-400 uppercase tracking-wider mb-0.5">
                              {row.label}
                            </div>
                            <div
                              className={`font-poppins text-sm font-semibold break-words ${row.highlight ? "text-brand-green text-base" : "text-gray-800"}`}
                            >
                              {row.value}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* CTA */}
                  <div className="p-6 bg-gray-50 border-t border-gray-100">
                    <Link href={`/mentorship/book/${mentor.slug}`} className="btn-primary w-full justify-center">
                      Proceed to Booking
                    </Link>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="bg-brand-green section-padding !py-16 relative overflow-hidden">
        <div className="absolute inset-0 hero-bg-pattern opacity-50" aria-hidden="true" />
        <div className="container-max px-6 md:px-8 relative z-10 text-center">
          <h2 className="font-montserrat font-black text-3xl md:text-4xl text-white mb-4">
            Ready to Start Your Journey?
          </h2>
          <p className="font-poppins text-white/70 mb-8 max-w-md mx-auto">
            Book a session with {mentor.name} and take the first step towards your goals.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={`/mentorship/book/${mentor.slug}`} className="btn-primary">
              Book Your Session
              <ArrowRight size={16} />
            </Link>
            <a
              href={whatsappLink(`Hi! I'd like to discuss mentorship with ${mentor.name}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              <MessageCircle size={16} />
              WhatsApp Us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function HowItWorksTimeline() {
  const steps = [
    { n: "01", title: "Submit Booking & Payment", desc: "Fill the booking form and upload your payment screenshot." },
    { n: "02", title: "Receive Confirmation", desc: "Our team verifies your payment within 24 hours and sends confirmation." },
    { n: "03", title: "Get Meeting Link", desc: "Your mentor sends a Google Meet or Zoom link to your email." },
    { n: "04", title: "Attend Your Session", desc: "Join your 1-on-1 session and start accelerating your growth." },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <h2 className="font-montserrat font-bold text-2xl text-brand-black mb-6">
        How It Works
      </h2>
      <div className="relative">
        {/* Vertical connector */}
        <div
          className="absolute left-5 top-6 bottom-6 w-0.5 bg-brand-gold/20 hidden sm:block"
          aria-hidden="true"
        />
        <div className="space-y-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="flex gap-5 group"
            >
              <div className="relative z-10 flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-brand-green flex items-center justify-center shadow-green-glow group-hover:shadow-gold-sm transition-shadow">
                  <span className="font-montserrat font-black text-xs text-brand-gold">{step.n}</span>
                </div>
              </div>
              <div className="pb-6">
                <h4 className="font-montserrat font-bold text-sm text-brand-black mb-1">
                  {step.title}
                </h4>
                <p className="font-poppins text-sm text-gray-500 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
