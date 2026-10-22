// src/lib/landing/templates-data/w20-diabetes.ts
// Seed copy extracted verbatim from "Landing pages/Webinar/Webinar20 Landing.html".
import type { LandingContent } from "@/lib/landing/content";
import type { RegistrationConfig } from "@/lib/landing/registration/config";

// Registration settings copied from the legacy Webinar 20 page. Free has no Philippines price
// because the Philippines page was Pro only. Groups of 3+ get 20% off Pro (Free cannot be a group).
// The legacy page had no verify message; the verify number is its WhatsApp support number.
const W20_REGISTRATION: RegistrationConfig = {
  enabled: true,
  modes: ["live"],
  recordedPercentOfRegular: 100,
  regions: [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "7:30 PM", timezoneLabel: "PKT", accountKeys: ["paypal", "easypaisa", "faysal"] },
    { key: "PH", label: "Philippines", currency: "PHP", classTime: "10:30 PM", timezoneLabel: "Philippine Time", accountKeys: ["paypal", "pnb_ph"] },
  ],
  defaultRegionKey: "PK",
  options: [
    { key: "free", label: "Free Access", kind: "bundle", free: true, waGroupUrl: "https://chat.whatsapp.com/HKo9nNrUCsB84AXPD3QPmH", moduleIds: [] },
    { key: "pro", label: "Pro Access", kind: "bundle", free: false, waGroupUrl: "https://chat.whatsapp.com/Bf6XZabVsORFh237IRN7Az", moduleIds: [] },
  ],
  moduleMix: { enabled: false, bundleOptionKey: "" },
  tiers: [{ key: "group", label: "Group (3+)", minSize: 3, maxSize: 50, percentOff: 20 }],
  prices: {
    free: { PK: { amount: 0 } },
    pro: { PK: { amount: 399 }, PH: { amount: 150 } },
  },
  earlyBirdEndsAt: "",
  capacity: 0,
  whatsappVerifyNumber: "923155614490",
  successTitle: "You're Registered!",
  eventLabel: "Webinar 20: Diabetes Pharmacotherapy",
  refPrefix: "DPT",
  professions: [], // the legacy page used a free-text "Profession / Affiliation" field
  discoveryOptions: ["Instagram", "Facebook", "WhatsApp", "LinkedIn", "PZ Academy Email", "Past PZ Academy Webinar", "Friend / Colleague", "Google / Search", "Other"],
  pixelId: "",
};

export const W20_DIABETES: LandingContent = {
  settings: {
    // The W20 page registers in an in-page modal and the file shows no registration URL of its own.
    // Left blank on purpose: the readiness checklist blocks publish until the admin sets a real link.
    registerUrl: "",
    registerLabel: "Register now",
    whatsappNumber: "923155614490",
    countdownTo: "",
    batchStartsOn: "",
    countdownLabel: "",
  },
  seo: {
    title: "Diabetes Pharmacotherapy: Choosing the Right Drug for the Right Patient | PZ Academy",
    description: "PZ Academy webinar: Diabetes Pharmacotherapy – Choosing the Right Drug for the Right Patient, with Dr. Christine Agnes Bianca.",
    ogImage: "",
  },
  // The webinar date goes stale: readiness asks the admin to update or keep it.
  needsReview: ["hero:dateLine"],
  registration: W20_REGISTRATION,
  modules: [],
  sections: [
    {
      id: "hero", type: "hero", enabled: true,
      data: {
        eyebrow: "Clinical pharmacotherapy education",
        headline: "Diabetes Pharmacotherapy: Choosing the Right Drug for the Right Patient",
        subheadline: "Compare the major antidiabetic drug classes and learn how efficacy, safety, hypoglycemia risk, weight, renal function, and cardiovascular considerations shape the right therapy for each patient.",
        image: "https://pharmacozyme.com/wp-content/uploads/2026/09/W-20-Hero-PC-1536x857.jpeg",
        primaryCtaLabel: "Register now",
        secondaryCtaLabel: "",
        secondaryCtaUrl: "",
        dateLine: "16th September 2026 • 7:30 PM PKT • 1-hour live webinar",
        badges: [],
      },
    },
    {
      id: "overview", type: "rich_text", enabled: true,
      data: {
        heading: "Diabetes pharmacotherapy is not a one-size-fits-all decision.",
        body: "Choosing an antidiabetic medication takes more than lowering blood glucose — it means weighing each patient's profile, treatment goals, safety, hypoglycemia risk, weight, renal function, and cardiovascular status. This session compares how the major drug classes stack up and how that reasoning applies to real clinical cases.\n\n- Compare major antidiabetic drug classes.\n- Weigh efficacy against safety when selecting therapy.\n- Assess hypoglycemia risk across drug classes.\n- Factor in the weight effects of antidiabetic medications.\n- Apply renal and cardiovascular considerations to drug choice.\n- Select and combine therapies for individual patient profiles.\n\n**Hands-on focus:** Apply pharmacotherapy concepts to real patient cases.\n\nDrug Class Comparison · Hypoglycemia Risk · Weight Effects · Renal Considerations · Cardiovascular Benefits · Combination Therapy",
        image: "https://pharmacozyme.com/wp-content/uploads/2026/09/Hands-on-focus-section-image-768x768.jpeg",
      },
    },
    {
      id: "agenda", type: "schedule", enabled: true,
      data: {
        heading: "One focused hour. Four practical modules.",
        items: [
          { when: "1", title: "Diabetes pharmacotherapy overview & drug class comparison", detail: "Review the overview of diabetes pharmacotherapy and compare the major antidiabetic drug classes available today." },
          { when: "2", title: "Efficacy, safety & hypoglycemia risk", detail: "Weigh efficacy against safety for each drug class and assess the hypoglycemia risk associated with different therapies." },
          { when: "3", title: "Weight, renal & cardiovascular considerations", detail: "Look at the weight effects of antidiabetic medications alongside renal considerations and the cardiovascular benefits of selected therapies." },
          { when: "4", title: "Patient-specific selection & clinical cases", detail: "Apply drug selection according to individual patient profile, review principles of combination therapy, and work through interactive clinical cases with live Q&A." },
        ],
      },
    },
    {
      id: "instructor", type: "instructors", enabled: true,
      data: {
        heading: "Meet your instructor",
        items: [
          {
            name: "Dr. Christine Agnes Bianca",
            role: "Licensed Physician · Certified Family Physician",
            bio: "Licensed Physician · Certified Family Physician, PAFP Associate Member, Philippine Academy of Family Physicians. Certified Trained Healthcare Professional in the Workshop on Refining and Enhancing Fundamentals in Diabetes and its Management, Institute for Studies on Diabetes Foundation.\n\n**Who this session is for:** Pharmacy students, medical students, healthcare professionals, residents and trainees, learners interested in clinical pharmacotherapy or diabetes management, and Philippines students.",
            photo: "https://pharmacozyme.com/wp-content/uploads/2026/09/Dr-Christine-225x300.png",
          },
        ],
      },
    },
    {
      id: "plans", type: "pricing_cards", enabled: true,
      data: {
        heading: "Choose your plan",
        note: "Free: YouTube access + participation certificate. Pro adds live Zoom access, recording, Kahoot quiz, and priority Q&A.",
        items: [
          { name: "Free", price: "PKR 0", oldPrice: "", badge: "", features: "- YouTube access\n- Participation certificate\n- Pakistan only" },
          { name: "Pro", price: "PKR 399", oldPrice: "", badge: "", features: "- Zoom\n- Recording\n- Kahoot quiz\n- Excellence certificate\n- Priority Q&A" },
          { name: "Pro — Group of 3 or more", price: "PKR 319 /person", oldPrice: "PKR 399", badge: "20% OFF", features: "- 20% OFF the Pro price\n- One group payment\n- Shared registration confirmation" },
        ],
      },
    },
    {
      id: "final-cta", type: "final_cta", enabled: true,
      data: {
        headline: "Register now",
        text: "A quick, guided 2–3 step form — no separate email needed. Pick your plan, add your details, and (for Pro) confirm payment — all inside one guided form. Group registrations get 20% off automatically.",
        buttonLabel: "Start Registration",
      },
    },
  ],
};
