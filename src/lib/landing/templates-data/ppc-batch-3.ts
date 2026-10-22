// src/lib/landing/templates-data/ppc-batch-3.ts
// Seed copy extracted verbatim from "Landing pages/Course/PPC-B3-Landing.html".
import type { LandingContent } from "@/lib/landing/content";
import type { PriceCell, RegistrationConfig } from "@/lib/landing/registration/config";

// Registration settings copied from the legacy page: price table, regions, payment accounts,
// WhatsApp groups, professions and "How did you hear about us?" options.
// Hand-set totals (groupTotals / earlyGroupTotals) are the legacy cells that differ from the
// 20% / 25% group discount: PKR Early Bird group of 3 = 11,500; USD and AED rounding cells.
const PPC_MODULE_PRICES = (): Record<string, PriceCell> => ({
  PK: { amount: 2000, earlyAmount: 1600 },
  UAE: { amount: 50, earlyAmount: 40, groupTotals: { group5: 188 } },
  KSA: { amount: 50, earlyAmount: 40, groupTotals: { group5: 188 } },
  PH: { amount: 900, earlyAmount: 720 },
  IN: { amount: 1200, earlyAmount: 960 },
  INTL: { amount: 20, earlyAmount: 16, earlyGroupTotals: { group3: 38 } },
});

const PPC_REGISTRATION: RegistrationConfig = {
  enabled: true,
  modes: ["live", "recorded"],
  recordedPercentOfRegular: 85,
  regions: [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 – 8:30 PM", timezoneLabel: "Pakistan Standard Time", accountKeys: ["faysal", "easypaisa"] },
    { key: "UAE", label: "United Arab Emirates", currency: "AED", classTime: "6:30 – 7:30 PM", timezoneLabel: "UAE / Gulf Time", accountKeys: ["mashreq", "paypal"] },
    { key: "KSA", label: "Saudi Arabia", currency: "SAR", classTime: "5:30 – 6:30 PM", timezoneLabel: "Saudi Arabia Time", accountKeys: ["anb", "paypal"] },
    { key: "PH", label: "Philippines", currency: "PHP", classTime: "10:30 – 11:30 PM", timezoneLabel: "Philippine Time", accountKeys: ["pnb_ph", "gcash", "paypal"] },
    { key: "IN", label: "India", currency: "INR", classTime: "8:00 – 9:00 PM", timezoneLabel: "India Standard Time", accountKeys: ["pnb_in", "paypal"] },
    { key: "INTL", label: "International", currency: "USD", classTime: "7:30 PM PKT", timezoneLabel: "Your Local Time", accountKeys: ["paypal"] },
  ],
  defaultRegionKey: "PK",
  options: [
    { key: "full", label: "Full Course", kind: "bundle", free: false, waGroupUrl: "https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle", moduleIds: [] },
    { key: "m1", label: "M1 Clinical Pharmacology", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/KLF9jSiENUE64EyZoOEH1W", moduleIds: [] },
    { key: "m2", label: "M2 Acute & Chronic Therapeutics", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/Lj2CBmor48lHWLXHgmSdxz", moduleIds: [] },
    { key: "m3", label: "M3 Critical Care & Emergency", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/Jjpym0jOL9hFgFNLz1JEQb", moduleIds: [] },
    { key: "m4", label: "M4 IV Therapy & Safety", kind: "module", free: false, waGroupUrl: "https://chat.whatsapp.com/GOERJJxSCjeKl5eHkevmbk", moduleIds: [] },
  ],
  moduleMix: { enabled: true, bundleOptionKey: "full" },
  tiers: [
    { key: "group3", label: "Group of 3", minSize: 3, maxSize: 3, percentOff: 20 },
    { key: "group5", label: "Group of 5", minSize: 5, maxSize: 5, percentOff: 25 },
  ],
  prices: {
    full: {
      PK: { amount: 6000, earlyAmount: 4800, earlyGroupTotals: { group3: 11500 } },
      UAE: { amount: 200, earlyAmount: 160 },
      KSA: { amount: 200, earlyAmount: 160 },
      PH: { amount: 3000, earlyAmount: 2400 },
      IN: { amount: 4000, earlyAmount: 3200 },
      INTL: { amount: 55, earlyAmount: 44, groupTotals: { group3: 131, group5: 204 }, earlyGroupTotals: { group5: 164 } },
    },
    m1: PPC_MODULE_PRICES(),
    m2: PPC_MODULE_PRICES(),
    m3: PPC_MODULE_PRICES(),
    m4: PPC_MODULE_PRICES(),
  },
  // REVIEW for a new batch: Batch 3's cutoff ("Early Bird pricing ends 15th October", midnight PKT).
  earlyBirdEndsAt: "2026-10-15T19:00:00Z",
  capacity: 0,
  whatsappVerifyNumber: "923700199429",
  successTitle: "Registration Submitted!",
  eventLabel: "PPC Batch 3",
  refPrefix: "PPC",
  professions: ["Doctor", "Pharmacist", "Nurse", "Allied Health Professional", "Student", "Other"],
  discoveryOptions: ["Friends", "WhatsApp", "Facebook", "Instagram", "Google", "YouTube", "Email", "Wall Poster"],
  pixelId: "",
};

export const PPC_BATCH_3: LandingContent = {
  settings: {
    registerUrl: "https://pharmacozyme.com/official-ppc-registration-page/",
    registerLabel: "Register now",
    whatsappNumber: "923700199429",
    countdownTo: "",
    batchStartsOn: "2026-10-30T14:30:00.000Z",
    countdownLabel: "",
  },
  seo: {
    title: "Master Practical Pharmacology | PharmacoZyme — PPC Batch 3",
    description: "Join Dr. Mehwish Kanwal for an intensive 4-week live clinical pharmacology course. Live sessions, recordings, notes, quizzes & certification.",
    ogImage: "",
  },
  // Dates and Early Bird prices go stale between batches: readiness asks the admin to update or keep each.
  needsReview: [
    "curriculum:items.0.subtitle", "curriculum:items.1.subtitle", "curriculum:items.2.subtitle", "curriculum:items.3.subtitle",
    "pricing:note", "pricing:items.0.price", "pricing:items.1.price", "pricing:items.2.price",
    "schedule:items.0.when", "schedule:items.1.when", "schedule:items.2.when", "schedule:items.3.when",
  ],
  registration: PPC_REGISTRATION,
  modules: [],
  sections: [
    {
      id: "hero", type: "hero", enabled: true,
      data: {
        eyebrow: "Enrollment Open — Batch 3",
        headline: "Master Practical Pharmacology with Precision",
        subheadline: "Join Dr. Mehwish Kanwal for an intensive clinical journey. Transition from theoretical knowledge to confident bedside medication management.",
        image: "https://pharmacozyme.com/wp-content/uploads/2026/06/ppc_batch_2_poster_instagram_post_34_9.png",
        primaryCtaLabel: "Enroll Now",
        secondaryCtaLabel: "",
        secondaryCtaUrl: "",
        dateLine: "Live Sessions 7:30 – 8:30 PM Pakistan Standard Time",
        badges: [
          { text: "Join 500+ medical professionals" },
          { text: "98% Success Satisfaction" },
          { text: "Limited seats — late fee after final deadline" },
        ],
      },
    },
    {
      id: "stats", type: "stats", enabled: true,
      data: {
        items: [
          { value: "4", label: "Modules" },
          { value: "4 wks", label: "Duration" },
          { value: "100%", label: "Clinical Focus" },
          { value: "Cert.", label: "on Completion" },
        ],
      },
    },
    {
      id: "curriculum", type: "curriculum", enabled: true,
      data: {
        heading: "Intensive 4-Module Curriculum",
        items: [
          { title: "Foundations of Clinical Pharmacology & Safe Prescribing", subtitle: "Module 01 · 30 – 31 Oct, 1 Nov", points: "- Core pharmacology principles, ADME/PD, prescription writing, and hospital medication fundamentals." },
          { title: "Therapeutics in Acute & Chronic Care", subtitle: "Module 02 · 6 – 8 Nov", points: "- Antimicrobials, cardiovascular pharmacology, and pain management in hospital practice." },
          { title: "Special Populations, Critical Care & Emergency Pharmacology", subtitle: "Module 03 · 13 – 15 Nov", points: "- Renal/hepatic dosing, geriatrics, ICU drugs, crash-cart medications, and high-alert therapies." },
          { title: "IV Therapy, Medication Safety & Clinical Integration", subtitle: "Module 04 · 20 – 22 Nov", points: "- Infusion calculations, IV fluids, medication-error prevention, and final clinical assessment." },
        ],
      },
    },
    {
      id: "benefits", type: "feature_cards", enabled: true,
      data: {
        heading: "Beyond the Standard Classroom",
        subheading: "Every enrollee receives the full clinical toolkit used by top-tier pharmacology departments worldwide.",
        items: [
          { title: "Live Sessions", text: "Real-time interaction every class." },
          { title: "Lifetime Recordings", text: "Rewatch every lecture, forever." },
          { title: "Daily Kahoot Quizzes", text: "Gamified assessment each session." },
          { title: "PDF Notes & PPTs", text: "High-yield, exam-ready material." },
          { title: "Certificate", text: "Shareable on LinkedIn & CV." },
          { title: "WhatsApp Group", text: "Instructor + peer discussion." },
        ],
      },
    },
    {
      id: "instructors", type: "instructors", enabled: true,
      data: {
        heading: "Expert Faculty",
        items: [
          {
            name: "Dr. Mehwish Kanwal",
            role: "Senior Pharmacist · Pharmacology Educator",
            bio: "Senior Pharmacist with over 8+ years of clinical experience across tertiary hospital settings, including senior roles in transplant and infection-control services in the UAE. Background in medication-safety leadership, sterile compounding supervision, and patient-centered care in high-acuity environments.\n\nStudents can expect a supportive, practical, clinically focused experience — complex concepts simplified, real-world cases integrated, and confidence built alongside competence.",
            photo: "https://pharmacozyme.com/wp-content/uploads/2026/06/Dr-Mehwish.jpeg",
          },
        ],
      },
    },
    {
      id: "video-reviews", type: "video_reviews", enabled: true,
      data: {
        heading: "Hear It Straight From Our Students",
        items: [
          { url: "https://www.youtube.com/shorts/o3xrqiXneyw", caption: "Abdullah" },
          { url: "https://www.youtube.com/shorts/ZJiE-zRqNQM", caption: "Durre Shahwar" },
          { url: "https://www.youtube.com/shorts/--INCVKFkS4", caption: "Hammad" },
          { url: "https://www.youtube.com/shorts/4KutGYMGZwE", caption: "Khadija" },
        ],
      },
    },
    {
      id: "pricing", type: "pricing_cards", enabled: true,
      data: {
        heading: "Choose Your Plan",
        note: "Early Bird prices until 15th October. After that: Single Module PKR 2,000 · Full Bundle PKR 6,000 · Group of 3 PKR 4,800 /person.",
        items: [
          { name: "Single Module", price: "PKR 1,600", oldPrice: "PKR 2,000", badge: "", features: "- 3 Live Sessions (1 Week)\n- Module Recordings\n- PDF Module Notes" },
          { name: "Full Professional Bundle", price: "PKR 4,800", oldPrice: "PKR 6,000", badge: "BEST VALUE", features: "- All 4 Modules (12 Sessions)\n- Lifetime Recording Access\n- Official Professional Certificate\n- Private WhatsApp Group" },
          { name: "Group of 3 (Full Course)", price: "PKR 3,833 /person", oldPrice: "PKR 4,800", badge: "Best for Teams", features: "- All 4 Modules (12 Sessions) — Full Course\n- One Payment Covers the Whole Group\n- Group of 5 available for even bigger savings" },
        ],
      },
    },
    {
      id: "schedule", type: "schedule", enabled: true,
      data: {
        heading: "Session Schedule",
        items: [
          { when: "30 – 31 Oct, 1 Nov · 7:30 – 8:30 PM PKT", title: "Module 1 — Foundations", detail: "Day 1: Intro to Pharmacology in Hospital · Day 2: ADME & Pharmacodynamics · Day 3: Prescription Writing" },
          { when: "6 – 8 Nov · 7:30 – 8:30 PM PKT", title: "Module 2 — Therapeutics", detail: "Day 4: Practical Antimicrobials · Day 5: Cardiovascular Acute/Chronic · Day 6: Pain & Analgesics" },
          { when: "13 – 15 Nov · 7:30 – 8:30 PM PKT", title: "Module 3 — Critical Care", detail: "Day 7: Renal/Hepatic Dosing · Day 8: Emergency & Crash Carts · Day 9: ICU & Critical Care" },
          { when: "20 – 22 Nov · 7:30 – 8:30 PM PKT", title: "Module 4 — Safety", detail: "Day 10: IV Fluids & Drips · Day 11: Safety & Error Prevention · Day 12: Integration & Review" },
        ],
      },
    },
    {
      id: "faq", type: "faq", enabled: true,
      data: {
        heading: "Common Questions",
        items: [
          { q: "Who is this course designed for?", a: "Working healthcare professionals — physicians, pharmacists, nurses, and allied health staff — plus interns and pharmacy students seeking practical hospital pharmacology skills." },
          { q: "What if I miss a live session?", a: "All sessions are recorded and uploaded to the learning portal. You have lifetime access to recordings and PDF notes." },
          { q: "Does it cover ICU and emergency pharmacology?", a: "Yes — Module 3 covers emergency medications, crash-cart drugs, vasopressors, sedatives, neuromuscular blockers, and critical-care pharmacology." },
          { q: "Will I receive a certificate?", a: "Yes. A PharmacoZyme certificate is awarded on completion — fully shareable on LinkedIn and your CV." },
          { q: "How does group registration work?", a: "The group lead pays the full group amount and adds each member's details during registration. The same payment screenshot is used for all; our team verifies and confirms each seat." },
        ],
      },
    },
    {
      id: "final-cta", type: "final_cta", enabled: true,
      data: {
        headline: "Will you be on the Batch 3 leaderboard?",
        text: "Still have questions? Just pick a format and get started — our team is on WhatsApp for anything else.",
        buttonLabel: "Join Batch 3",
      },
    },
  ],
};
