"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { type Mentor, formatPrice } from "@/lib/mentors";

interface MentorCardProps {
  mentor: Mentor;
  index: number;
}

export default function MentorCard({ mentor, index }: MentorCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.55, delay: index * 0.13, ease: "easeOut" }}
      whileHover={{
        translateY: -6,
        boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
        borderColor: "#C9A84C",
      }}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E1D8",
        borderRadius: "16px",
        padding: "32px 28px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        cursor: "pointer",
      }}
    >
      {/* Photo */}
      <div className="relative mb-4" style={{ width: "100px", height: "100px" }}>
        <div
          className="rounded-full overflow-hidden"
          style={{
            width: "100px",
            height: "100px",
            border: "3px solid #C9A84C",
          }}
        >
          <Image
            src={mentor.photo}
            alt={`${mentor.name} – ${mentor.expertise}`}
            width={100}
            height={100}
            className="object-cover object-top w-full h-full"
            style={{ transition: "transform 0.4s ease" }}
          />
        </div>
        {/* Verified badge */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            bottom: 2,
            right: 2,
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "#C9A84C",
            border: "2px solid #FFFFFF",
          }}
          aria-label="Verified mentor"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="white" aria-hidden="true">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
        </div>
      </div>

      {/* Name */}
      <h3
        className="font-montserrat mb-2"
        style={{ fontWeight: 700, fontSize: "20px", color: "#0D0D0D" }}
      >
        {mentor.name}
      </h3>

      {/* Expertise badge — light green bg, dark green text */}
      <span
        className="font-poppins mb-3"
        style={{
          fontWeight: 600,
          fontSize: "11px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          background: "#E8F5EE",
          color: "#1A4D2E",
          borderRadius: "50px",
          padding: "4px 14px",
          display: "inline-block",
        }}
      >
        {mentor.expertise}
      </span>

      {/* Bio */}
      <p
        className="font-poppins mb-3"
        style={{
          fontWeight: 400,
          fontSize: "14px",
          color: "#6B7280",
          lineHeight: 1.55,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          maxWidth: "100%",
        }}
      >
        {mentor.shortBio}
      </p>

      {/* Meta — experience + language */}
      <p
        className="font-poppins mb-4"
        style={{ fontSize: "13px", color: "#9CA3AF", fontWeight: 400 }}
      >
        {mentor.experience} Experience
        <span style={{ margin: "0 6px", color: "#C9A84C" }}>•</span>
        {mentor.language}
      </p>

      {/* Price */}
      <p
        className="font-montserrat mb-5"
        style={{ fontWeight: 700, fontSize: "16px", color: "#C9A84C" }}
      >
        From PKR XXXXX / session
      </p>

      {/* CTA */}
      <Link
        href={`/mentorship/mentors/${mentor.slug}`}
        className="w-full inline-flex items-center justify-center gap-2 group"
        style={{
          border: "2px solid #C9A84C",
          color: "#1A4D2E",
          background: "transparent",
          borderRadius: "8px",
          padding: "12px 16px",
          fontFamily: "var(--font-montserrat), Montserrat, sans-serif",
          fontWeight: 700,
          fontSize: "13px",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          transition: "all 0.25s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "#C9A84C";
          (e.currentTarget as HTMLAnchorElement).style.color = "#1A4D2E";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
          (e.currentTarget as HTMLAnchorElement).style.color = "#1A4D2E";
        }}
        aria-label={`View profile of ${mentor.name}`}
      >
        View Profile
        <ArrowRight size={13} />
      </Link>
    </motion.div>
  );
}

export function ComingSoonCard({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.55, delay: index * 0.13 }}
      style={{
        background: "#F4F4F4",
        border: "2px dashed #D1D5DB",
        borderRadius: "16px",
        padding: "32px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        minHeight: "360px",
      }}
    >
      <div
        className="rounded-full flex items-center justify-center mb-4"
        style={{ width: "72px", height: "72px", background: "#E5E7EB" }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" aria-hidden="true">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor"/>
        </svg>
      </div>
      <h3
        className="font-montserrat mb-2"
        style={{ fontWeight: 700, fontSize: "17px", color: "#9CA3AF" }}
      >
        More Mentors Coming Soon
      </h3>
      <p
        className="font-poppins"
        style={{ fontStyle: "italic", fontSize: "13px", color: "#9CA3AF", lineHeight: 1.5 }}
      >
        We&apos;re growing our network of elite professionals.
      </p>
    </motion.div>
  );
}
