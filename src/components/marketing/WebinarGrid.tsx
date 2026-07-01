"use client";

import { useState } from "react";
import { Calendar, Play, CheckCircle } from "lucide-react";

const SPEAKERS = [
  { name: "Dr Imad",        initials: "DI", topic: "Pharmacokinetics in Clinical Practice",         date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/Elqiz7k_6PQ", avatarBg: "#0F3D22", avatarText: "#7ED957" },
  { name: "Dr Maheen",      initials: "DM", topic: "Managing Drug-Drug Interactions",               date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/2dy8vIKzgtg", avatarBg: "#7ED957", avatarText: "#0F3D22" },
  { name: "Dr Ghazal",      initials: "DG", topic: "Antimicrobial Stewardship Essentials",          date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/HR71q4OycrM", avatarBg: "#194B32", avatarText: "#C8F0A0" },
  { name: "Dr Hina",        initials: "DH", topic: "Paediatric Drug Safety & Dosing",               date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/yETCHKZH9fA", avatarBg: "#196432", avatarText: "#ffffff" },
  { name: "Dr Mehwish",     initials: "DW", topic: "Adverse Drug Reaction Monitoring",              date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/hPqB_RgTU68", avatarBg: "#C8F0A0", avatarText: "#0F3D22" },
  { name: "Dr Laiq",        initials: "DL", topic: "Evidence-Based Prescribing",                    date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/sSt4U9tzbVE", avatarBg: "#0F3D22", avatarText: "#7ED957" },
  { name: "Dr Maria",       initials: "DR", topic: "Clinical Toxicology Essentials",                date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/7aSC1hRQIWg", avatarBg: "#194B32", avatarText: "#7ED957" },
  { name: "Dr Arzoo",       initials: "DA", topic: "Rational Drug Use & Pharmacy Practice",         date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/SAr3WD4fPVc", avatarBg: "#196432", avatarText: "#ffffff" },
  { name: "Ms Afreen",      initials: "MA", topic: "Patient Counselling & Medication Adherence",    date: "Date TBD", status: "past",     ytLink: "https://youtube.com/live/M6xeB8C8bU0", avatarBg: "#7ED957", avatarText: "#0F3D22" },
  { name: "Dr Sajjad",      initials: "DS", topic: "Critical Care Pharmacology",                    date: "Date TBD", status: "upcoming", ytLink: "https://youtube.com/live/HuC98JqYbz8", avatarBg: "#0F3D22", avatarText: "#C8F0A0" },
  { name: "Dr Farid",       initials: "DF", topic: "Cardiovascular Drug Therapy",                   date: "Date TBD", status: "upcoming", ytLink: "https://youtube.com/live/8-hWM5LV9CQ", avatarBg: "#194B32", avatarText: "#C8F0A0" },
  { name: "Mr Waqar",       initials: "MW", topic: "Pharmaceutical Calculations in Practice",       date: "Date TBD", status: "upcoming", ytLink: "https://youtube.com/live/rkQSJ7UMc9g", avatarBg: "#196432", avatarText: "#7ED957" },
  { name: "Dr Quratullain", initials: "DQ", topic: "Renal & Hepatic Dose Adjustment",               date: "Date TBD", status: "upcoming", ytLink: "https://youtube.com/live/3gDEFyOsw78", avatarBg: "#0F3D22", avatarText: "#7ED957" },
] as const;

type Filter = "all" | "past" | "upcoming";

export function WebinarGrid() {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = SPEAKERS.filter(s => filter === "all" || s.status === filter);

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-2 justify-center mb-10 flex-wrap">
        {(["all", "upcoming", "past"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-2 rounded-full text-sm font-semibold font-poppins border transition-all duration-200 capitalize ${
              filter === f
                ? "bg-pz-forest text-white border-pz-forest"
                : "bg-white text-pz-muted border-pz-border hover:border-pz-mid hover:text-pz-forest"
            }`}
          >
            {f === "all" ? "All Webinars" : f === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {visible.map((sp) => (
          <div
            key={sp.name}
            className="bg-white rounded-2xl border-[1.5px] border-pz-border overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-lg hover:border-transparent"
          >
            {/* Card top */}
            <div className="p-5 flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold font-montserrat shrink-0"
                style={{ background: sp.avatarBg, color: sp.avatarText }}
              >
                {sp.initials}
              </div>
              <span className={`text-[.67rem] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                sp.status === "upcoming"
                  ? "bg-[rgba(126,217,87,.12)] text-pz-forest border border-[rgba(126,217,87,.3)]"
                  : "bg-[rgba(201,150,10,.1)] text-pz-gold border border-[rgba(201,150,10,.25)]"
              }`}>
                {sp.status === "upcoming" ? "Upcoming" : "Recorded"}
              </span>
            </div>

            {/* Body */}
            <div className="px-5 pb-4 flex-1 flex flex-col gap-1.5">
              <div className="font-semibold text-pz-deep font-poppins text-[.95rem]">{sp.name}</div>
              <div className="text-pz-muted text-[.83rem] font-poppins leading-snug">{sp.topic}</div>
              <div className="flex items-center gap-1.5 text-pz-muted text-[.76rem] font-poppins mt-1">
                <Calendar className="w-3.5 h-3.5 text-pz-mid" />
                {sp.date}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              {sp.status === "past" ? (
                <a
                  href={sp.ytLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-pz-forest text-white text-[.84rem] font-semibold font-poppins transition-all duration-200 hover:bg-pz-mid hover:-translate-y-0.5 hover:shadow-card"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Watch Recording
                </a>
              ) : (
                <a
                  href="https://pz-academy.pharmacozyme.com/mentorship"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-pz-bright text-pz-forest text-[.84rem] font-semibold font-poppins transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(126,217,87,.35)]"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Register Now
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
