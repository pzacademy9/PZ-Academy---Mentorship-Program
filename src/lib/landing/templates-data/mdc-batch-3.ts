// src/lib/landing/templates-data/mdc-batch-3.ts
// Seed copy extracted verbatim from "Landing pages/Workshop/MDC-B3-Landing.html".
import type { LandingContent } from "@/lib/landing/content";

export const MDC_BATCH_3: LandingContent = {
  settings: {
    // The MDC page has no separate registration page (it registers in an in-page modal);
    // this is the page's own public URL, taken from its Meta Pixel event_source_url fallback.
    registerUrl: "https://pharmacozyme.com/mdc-2-dr-mehwish-kanwal/",
    registerLabel: "Register now",
    whatsappNumber: "923700199429",
    countdownTo: "",
    countdownLabel: "",
  },
  seo: {
    title: "MDC Workshop — Mastering Dose Calculation | PZ Academy",
    description: "4-day live Zoom workshop. Master dose calculations, build clinical confidence. Taught by Dr. Mehwish Kanwal, PharmD.",
    ogImage: "",
  },
  sections: [
    {
      id: "hero", type: "hero", enabled: true,
      data: {
        eyebrow: "LIVE ON ZOOM · 04–07 SEPTEMBER 2026",
        headline: "Mastering Dose Calculation",
        subheadline: "Overcome calculation anxiety and build unwavering clinical confidence in just 4 days.",
        image: "https://pharmacozyme.com/wp-content/uploads/2026/05/MDC-hero-mobile-PC.png",
        primaryCtaLabel: "Register Now",
        secondaryCtaLabel: "",
        secondaryCtaUrl: "",
        dateLine: "04–07 September 2026 · 7:30 PM PKT",
        badges: [
          { text: "2,500+ Students Trained" },
          { text: "04 – 07 Sep 4 Days Live" },
          { text: "Certificate Included" },
          { text: "9+ Years Expert Instructor" },
        ],
      },
    },
    {
      id: "stats", type: "stats", enabled: true,
      data: {
        items: [
          { value: "2,500+", label: "Students Trained" },
          { value: "98%", label: "Pass Rate" },
          { value: "4", label: "Live Sessions" },
          { value: "15+", label: "Yrs Experience" },
        ],
      },
    },
    {
      id: "problem", type: "rich_text", enabled: true,
      data: {
        heading: "Does dose calculation make you anxious?",
        body: "You're not alone. Most pharmacy students and graduates struggle with the same fears.\n\n- **Failing Exams?** Calculation errors costing you marks when you know the theory.\n- **Blanking During Rounds?** Freezing at the bedside when a doctor asks for a quick dose check.\n- **Scared of IV Maths?** Infusion rates, drip calculations — the numbers feel overwhelming.\n\n**MDC Workshop fixes this in 4 days.** Step-by-step formulas, live practice, 1,500+ questions — until calculation feels automatic.",
        image: "",
      },
    },
    {
      id: "workbook", type: "feature_cards", enabled: true,
      data: {
        heading: "MDC WorkBook — 2nd Edition",
        subheading: "The full edition covers every topic in the 4-day workshop — with 100+ practice problems, clinical cases, and formula references.",
        items: [
          { title: "Session Recordings Included", text: "" },
          { title: "2 Certificates Awarded", text: "" },
          { title: "Daily Kahoot Quizzes", text: "" },
          { title: "Live Q&A Every Session", text: "" },
          { title: "Real Clinical Scenarios", text: "" },
          { title: "IV & Paediatric Dosing", text: "" },
          { title: "1,500+ Practice Questions", text: "" },
          { title: "Open Globally · Live on Zoom", text: "" },
          { title: "Taught by Dr. Mehwish Kanwal", text: "" },
          { title: "04 – 07 September 2026", text: "" },
        ],
      },
    },
    {
      id: "instructor", type: "instructors", enabled: true,
      data: {
        heading: "Meet Dr. Mehwish Kanwal",
        items: [
          {
            name: "Dr. Mehwish Kanwal",
            role: "PharmD · Senior Clinical Pharmacist · King's College Hospital – UAE",
            bio: "With over 9 years of clinical pharmacy experience across hospitals in Australia and the UAE, Dr. Mehwish has trained thousands of pharmacy professionals. Her teaching strips away the fear of numbers and replaces it with systematic, repeatable skill.",
            photo: "https://pharmacozyme.com/wp-content/uploads/2026/03/pz_dr_mehwish.jpg",
          },
        ],
      },
    },
    {
      id: "curriculum", type: "curriculum", enabled: true,
      data: {
        heading: "What You'll Learn",
        items: [
          { title: "Formulas & Conversions", subtitle: "Week 1", points: "- Master metric conversions, unit analysis, and the core dose calculation formula from first principles." },
          { title: "Weight-Based Dosing", subtitle: "Dosing", points: "- Calculate mg/kg doses for adults and paediatric patients with confidence in any clinical setting." },
          { title: "IV Infusion Rates", subtitle: "IV", points: "- Drip rate calculations, pump programming, and continuous infusion maths for critical care." },
          { title: "OTC & Hospital Dosing", subtitle: "Hospital", points: "- Real-world dispensing, reconstitution, and dose adjustments for OTC and inpatient scenarios." },
          { title: "Paediatric Dosing", subtitle: "Paeds", points: "- Age-based, weight-based, and BSA calculations for neonates through adolescents." },
          { title: "Dilutions & Concentrations", subtitle: "Advanced", points: "- Serial dilutions, percentage strength calculations, and concentration adjustments." },
        ],
      },
    },
    {
      id: "pricing", type: "pricing_cards", enabled: true,
      data: {
        heading: "Choose How You Learn",
        note: "Early bird pricing ends 29 Aug 2026",
        items: [
          { name: "Individual — Early Bird", price: "PKR 2,700 /person", oldPrice: "PKR 3,500", badge: "Early Bird", features: "- 4 live Zoom sessions + recordings\n- Step-by-step worked examples daily\n- Daily Kahoot quiz access\n- Certificate of Participation\n- WhatsApp support group" },
          { name: "Individual", price: "PKR 3,500 /person", oldPrice: "", badge: "", features: "- 4 live Zoom sessions + recordings\n- Step-by-step worked examples daily\n- Daily Kahoot quiz access\n- Certificate of Participation\n- WhatsApp support group" },
          { name: "Group of 3+ — Early Bird", price: "PKR 2,160 /person", oldPrice: "PKR 2,800", badge: "Best Value", features: "- 4 live Zoom sessions + recordings\n- Step-by-step worked examples daily\n- Daily Kahoot quiz access\n- Certificate of Participation\n- WhatsApp support group\n- Top 10 Kahoot → Certificate of Excellence" },
          { name: "Group of 3+", price: "PKR 2,800 /person", oldPrice: "", badge: "Best Value", features: "- 4 live Zoom sessions + recordings\n- Step-by-step worked examples daily\n- Daily Kahoot quiz access\n- Certificate of Participation\n- WhatsApp support group\n- Top 10 Kahoot → Certificate of Excellence" },
        ],
      },
    },
    {
      id: "agenda", type: "schedule", enabled: true,
      data: {
        heading: "4-Day Agenda",
        items: [
          { when: "Day 1", title: "Foundations & Core Formula", detail: "Metric system & unit conversions · Basic dose calculation formula · Medication safety protocols · Live practice: 50 foundation questions" },
          { when: "Day 2", title: "Advanced Oral & Liquid Medications", detail: "Tablet & capsule dose calculations · Suspensions & elixirs · Concentration & percentage strength · Reconstitution calculations" },
          { when: "Day 3", title: "IV Therapy & Infusions", detail: "IV drip rate calculations (drops/min) · Infusion pump programming (mL/hr) · Heparin & insulin infusion maths · Paediatric IV calculations" },
          { when: "Day 4", title: "Clinical Mastery & Assessment", detail: "Complex case studies · Kahoot speed drill championship · Certificate of Excellence assessment · Q&A with Dr. Mehwish" },
        ],
      },
    },
    {
      id: "testimonials", type: "testimonials", enabled: true,
      data: {
        heading: "Real Results, Real Voices",
        items: [
          { quote: "Before MDC I would second-guess every bedside calculation. After Day 2 alone I felt like a completely different pharmacist.", name: "Sara Ahmed", role: "PharmD Student · Karachi", photo: "" },
          { quote: "The IV infusion module alone was worth it. Dr. Mehwish explains things in a way that actually sticks. My confidence in the ward has shot up.", name: "Ahmed Khan", role: "Hospital Pharmacist · Dubai", photo: "" },
          { quote: "I registered as a group with 2 friends. The paediatric dosing day was incredible — we all passed our clinical assessments the following month!", name: "Fatima Raza", role: "PharmD Graduate · Lahore", photo: "" },
          { quote: "As a Saudi pharmacist working in Riyadh, I was worried about the timing. Dr. Mehwish's clarity made every calculation approachable. Absolutely worth it.", name: "Nora Al-Mansouri", role: "Clinical Pharmacist · Riyadh", photo: "" },
        ],
      },
    },
    {
      id: "faq", type: "faq", enabled: true,
      data: {
        heading: "Frequently Asked Questions",
        items: [
          { q: "Is this workshop suitable for fresh PharmD graduates?", a: "Yes — the workshop is designed for both students and working pharmacists. Day 1 starts from foundational concepts so no prior calculation experience is required." },
          { q: "What do I need to attend?", a: "A device with Zoom installed (phone or laptop), a basic calculator, and a notebook. All sessions are recorded for registered participants." },
          { q: "Will sessions be recorded?", a: "Yes. Recordings are shared with all registered participants within 24 hours of each session. Access lasts for 30 days post-workshop." },
          { q: "How do I get the Certificate of Excellence?", a: "The Certificate of Excellence is awarded to the top performers in the Day 4 Kahoot speed drill assessment. Every participant receives a Certificate of Participation." },
          { q: "Can I join from outside Pakistan/UAE?", a: "Absolutely. The workshop is online and open to pharmacists and students globally. Payment methods vary by region — contact us on WhatsApp for options." },
          { q: "What is the group discount?", a: "Groups of 3 or more receive a discounted rate of PKR 2,800 per person. Register together using the group option in the form." },
          { q: "What happens after I pay?", a: "Upload your payment screenshot in the registration form. You will receive a WhatsApp confirmation within a few hours and be added to the workshop group." },
          { q: "Is there a refund policy?", a: "Registrations are non-refundable but transferable. If you cannot attend, you can transfer your seat to another person — contact us before the workshop starts." },
        ],
      },
    },
    {
      id: "final-cta", type: "final_cta", enabled: true,
      data: {
        headline: "Stop second-guessing. Start calculating right.",
        text: "Join pharmacists and students from Pakistan, UAE & Saudi Arabia mastering dose calculations in just 4 days.",
        buttonLabel: "Register Now",
      },
    },
  ],
};
