"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle, MessageCircle, ArrowRight, Mail } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { whatsappLink } from "@/lib/utils";
import { Metadata } from "next";

const waMsg = "Hi PZ Academy! I need help with my booking.";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.3 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export default function ThankYouPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#F0FAF4] flex flex-col items-center justify-center py-32 px-6">
        {/* Floating bg particles */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {[
            { size: 300, top: "10%", left: "-5%", opacity: 0.04 },
            { size: 200, top: "60%", right: "-3%", opacity: 0.05 },
            { size: 150, bottom: "10%", left: "30%", opacity: 0.03 },
          ].map((el, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-brand-green"
              style={{
                width: el.size,
                height: el.size,
                top: el.top,
                left: el.left,
                right: (el as { right?: string }).right,
                bottom: (el as { bottom?: string }).bottom,
                opacity: el.opacity,
              }}
              animate={{ scale: [1, 1.08, 1], rotate: [0, 10, 0] }}
              transition={{ duration: 8 + i * 2, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>

        <motion.article
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative bg-white rounded-3xl border border-brand-green-mid/15 shadow-[0_20px_60px_rgba(26,77,46,0.10)] p-10 md:p-14 w-full max-w-2xl text-center overflow-hidden"
          role="main"
          aria-label="Booking confirmation"
        >
          {/* Subtle radial gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(46,125,82,0.06) 0%, transparent 70%)" }}
            aria-hidden="true"
          />

          {/* Glowing checkmark */}
          <motion.div variants={fadeUp} className="flex justify-center mb-7 relative z-10">
            <motion.div
              className="relative"
              animate={{
                boxShadow: ["0 0 20px rgba(201,168,76,0.3)", "0 0 50px rgba(201,168,76,0.7)", "0 0 20px rgba(201,168,76,0.3)"],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              style={{ borderRadius: "50%" }}
            >
              <div className="w-24 h-24 rounded-full bg-brand-gold/10 border-2 border-brand-gold flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
                >
                  <CheckCircle size={48} className="text-brand-gold" strokeWidth={1.5} />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>

          {/* Heading */}
          <motion.h1
            variants={fadeUp}
            className="font-montserrat font-black text-3xl md:text-4xl text-brand-green mb-4 relative z-10"
          >
            Booking Request Received!
          </motion.h1>

          {/* Body text */}
          <motion.p
            variants={fadeUp}
            className="font-poppins text-base md:text-lg text-gray-700 leading-relaxed mb-3 relative z-10 max-w-lg mx-auto"
          >
            Our team will verify your payment and confirm your session within{" "}
            <span className="font-semibold text-brand-green">24–48 hours</span>.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="flex items-center justify-center gap-2 text-gray-500 font-poppins text-sm mb-8 relative z-10"
          >
            <Mail size={14} className="text-brand-gold" strokeWidth={1.5} />
            A confirmation has been sent to your email inbox.
          </motion.div>

          {/* Divider */}
          <motion.div
            variants={fadeUp}
            className="w-20 h-px bg-gray-200 mx-auto mb-8 relative z-10"
          />

          {/* Next steps */}
          <motion.div
            variants={fadeUp}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 text-left relative z-10"
          >
            {[
              { step: "01", title: "Payment Verified", desc: "Our admin reviews your screenshot within 24h." },
              { step: "02", title: "Email Confirmation", desc: "You'll receive a confirmation to your inbox." },
              { step: "03", title: "Session Scheduled", desc: "Mentor sends meeting link before your session." },
            ].map((item) => (
              <div key={item.step} className="bg-[#F0FAF4] border border-brand-green-mid/10 rounded-xl p-4">
                <span className="font-montserrat font-black text-xs text-brand-gold block mb-1">{item.step}</span>
                <h3 className="font-montserrat font-bold text-xs text-brand-black mb-1">{item.title}</h3>
                <p className="font-poppins text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-4 justify-center relative z-10"
          >
            <motion.a
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              href={whatsappLink(waMsg)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp"
            >
              <MessageCircle size={16} />
              Need Help? WhatsApp Us
            </motion.a>

            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link href="/#mentors" className="btn-secondary text-brand-green border-brand-green hover:bg-brand-green/5">
                Explore More Mentors
                <ArrowRight size={15} />
              </Link>
            </motion.div>
          </motion.div>

          {/* WhatsApp number */}
          <motion.p
            variants={fadeUp}
            className="font-poppins text-xs text-gray-400 mt-4 relative z-10"
          >
            +92 370 0199 429
          </motion.p>
        </motion.article>

        {/* Brand tag */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="font-allura text-brand-green/40 text-xl mt-8"
        >
          Excellence through Mentorship
        </motion.p>
      </main>
      <Footer />
    </>
  );
}
