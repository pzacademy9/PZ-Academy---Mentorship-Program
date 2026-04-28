"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Instagram, Linkedin, Twitter, Mail, MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/utils";

const quickLinks = [
  { label: "Meet Mentors",    href: "/#mentors" },
  { label: "Become a Mentor", href: "/#apply" },
  { label: "How It Works",    href: "/#how-it-works" },
  { label: "About PZ Academy",href: "#" },
  { label: "Privacy Policy",  href: "#" },
];

const socialIcons = [
  { icon: <Instagram size={20} />, href: "#",                                   label: "Instagram" },
  { icon: <Linkedin size={20} />,  href: "#",                                   label: "LinkedIn"  },
  { icon: <Twitter size={20} />,   href: "#",                                   label: "Twitter"   },
  { icon: <Mail size={20} />,      href: "mailto:mentorship@pzacademy.com",     label: "Email"     },
];

export default function Footer() {
  return (
    <footer
      id="contact"
      style={{
        background: "#0D0D0D",
        borderTop: "3px solid #C9A84C",
      }}
    >
      {/* Main grid */}
      <div className="container-max px-6 md:px-10 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

          {/* Col 1 — Brand */}
          <div>
            <Link href="/" className="inline-block mb-4">
              <div className="flex flex-col leading-none">
                <span
                  className="font-montserrat uppercase tracking-widest"
                  style={{ fontWeight: 800, fontSize: "22px", color: "#C9A84C", letterSpacing: "0.12em" }}
                >
                  PZ Academy
                </span>
                <span
                  className="font-allura"
                  style={{ fontSize: "16px", color: "rgba(255,255,255,0.5)", lineHeight: 1.3 }}
                >
                  Mentorship Program
                </span>
              </div>
            </Link>

            <p
              className="font-poppins mb-6"
              style={{ fontSize: "14px", color: "#9CA3AF", lineHeight: 1.7, maxWidth: "280px" }}
            >
              Connecting ambitious professionals with verified industry experts for
              transformative 1-on-1 mentorship.
            </p>

            {/* Social icons */}
            <div className="flex gap-4">
              {socialIcons.map(({ icon, href, label }) => (
                <motion.a
                  key={label}
                  href={href}
                  aria-label={label}
                  whileHover={{ scale: 1.2, color: "#C9A84C" }}
                  style={{ color: "rgba(255,255,255,0.35)", display: "inline-flex", transition: "color 0.2s" }}
                  className="hover:text-brand-gold"
                >
                  {icon}
                </motion.a>
              ))}
            </div>
          </div>

          {/* Col 2 — Quick Links */}
          <div>
            <h4
              className="font-montserrat mb-5"
              style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#C9A84C" }}
            >
              Quick Links
            </h4>
            <ul className="space-y-3">
              {quickLinks.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="font-poppins transition-colors"
                    style={{ fontSize: "14px", color: "rgba(255,255,255,0.55)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "#C9A84C"}
                    onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.55)"}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Contact */}
          <div>
            <h4
              className="font-montserrat mb-5"
              style={{ fontWeight: 700, fontSize: "13px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#C9A84C" }}
            >
              Contact
            </h4>

            <div className="space-y-3 mb-6">
              <a
                href="mailto:pz.academy9@gmail.com"
                className="flex items-center gap-3 font-poppins transition-colors"
                style={{ fontSize: "14px", color: "rgba(255,255,255,0.55)" }}
                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "#C9A84C"}
                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.55)"}
              >
                <Mail size={16} style={{ color: "#C9A84C", flexShrink: 0 }} />
                pz.academy9@gmail.com
              </a>
              <a
                href={whatsappLink("Hi! I'd like to know more about PZ Academy mentorship.")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 font-poppins transition-colors"
                style={{ fontSize: "14px", color: "rgba(255,255,255,0.55)" }}
                onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = "#C9A84C"}
                onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.55)"}
              >
                <MessageCircle size={16} style={{ color: "#C9A84C", flexShrink: 0 }} />
                +92 370 0199 429 | +92 315 5614490
              </a>
            </div>

            {/* WhatsApp pill button */}
            <motion.a
              whileHover={{ scale: 1.04, boxShadow: "0 0 20px rgba(37,211,102,0.35)" }}
              href={whatsappLink("Hi! I'd like to book a mentorship session at PZ Academy.")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp inline-flex"
              style={{ borderRadius: "50px", fontSize: "12px", padding: "10px 22px" }}
            >
              <MessageCircle size={15} />
              WhatsApp Us
            </motion.a>
          </div>
        </div>

        {/* Divider + copyright */}
        <div
          className="mt-14 pt-7 flex flex-col md:flex-row items-center justify-between gap-3"
          style={{ borderTop: "1px solid #2A2A2A" }}
        >
          <p
            className="font-poppins text-center md:text-left"
            style={{ fontSize: "13px", color: "#6B7280" }}
          >
            © {new Date().getFullYear()} PZ Academy. All rights reserved.
          </p>
          <p className="font-allura" style={{ fontSize: "18px", color: "rgba(201,168,76,0.45)" }}>
            Excellence through Mentorship
          </p>
        </div>
      </div>
    </footer>
  );
}
