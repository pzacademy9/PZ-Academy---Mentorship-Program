export interface Mentor {
  slug: string;
  name: string;
  title: string;
  expertise: string;
  shortBio: string;
  fullBio: string[];
  photo: string;
  experience: string;
  domain: string;
  language: string;
  format: string;
  pricePerSession: number;
  packages: { name: string; sessions: number; price: number; savings?: number }[];
  availability: string;
  leadTime: string;
  credentials: { title: string; institution: string; icon: string }[];
  skills: string[];
}

export const mentors: Mentor[] = [
  {
    slug: "dr-roha",
    name: "Dr. Roha",
    title: "Clinical Medicine & Healthcare Management",
    expertise: "Clinical Medicine",
    shortBio: "MBBS doctor and Medical Officer with 5 years of clinical and hospital administration experience.",
    fullBio: [
      "Dr. Roha is an MBBS-qualified Medical Officer with 5 years of hands-on clinical experience at Alees Medical Center, Islamabad. She combines strong clinical knowledge with a Master's in Healthcare Management, giving her a dual perspective on both patient care and hospital operations.",
      "Her mentorship covers clinical reasoning, OPD and IPD pharmacy workflows, and the administrative side of healthcare — an often-overlooked skill set that separates good practitioners from great ones.",
      "Dr. Roha is passionate about helping pharmacy and medical students understand how hospitals actually function, bridging the gap between textbook knowledge and real-world practice.",
    ],
    photo: "/mentor-dr-roha.png",
    experience: "5 Years",
    domain: "Medicine & Healthcare",
    language: "English / Urdu",
    format: "Online via Google Meet",
    pricePerSession: 3500,
    packages: [
      { name: "Single Session", sessions: 1, price: 3500 },
      { name: "3-Session Pack", sessions: 3, price: 9500, savings: 1000 },
      { name: "5-Session Pack", sessions: 5, price: 15500, savings: 2000 },
    ],
    availability: "Mon, Tue, Fri (Full Day)",
    leadTime: "24 hours advance",
    credentials: [
      { title: "MBBS", institution: "Pakistan", icon: "GraduationCap" },
      { title: "MS Healthcare Management", institution: "Pakistan", icon: "Award" },
      { title: "Medical Officer", institution: "Alees Medical Center", icon: "BookOpen" },
    ],
    skills: [
      "Clinical Knowledge & Patient Care",
      "OPD & IPD Pharmacy Workflows",
      "Hospital Operations & Administration",
      "Healthcare Management",
      "Patient Counselling",
      "Clinical Decision-Making",
    ],
  },
  {
    slug: "ghazal-naqvi",
    name: "Ghazal Naqvi",
    title: "Clinical Pharmacy & ICU Pharmacotherapy",
    expertise: "Clinical Pharmacy",
    shortBio: "PhD-qualified Senior Clinical Pharmacist & Assistant Professor with 13+ years specialising in ICU pharmacotherapy, antimicrobial stewardship, and pharmacovigilance.",
    fullBio: [
      "Dr. Ghazal Naqvi is a PhD-qualified Clinical Pharmacist and Assistant Professor at Fiji National University with 13+ years of progressive experience across tertiary-care hospitals, critical care units, and academic institutions. She holds a PhD in Pharmacy Practice and an MPhil in Pharmacology, both from Jinnah University for Women.",
      "Her clinical career at Dr. Ruth K.M. Pfau Civil Hospital spanned nearly a decade, where she served as Senior Clinical Pharmacist & Research Associate (BPS-18), leading pharmacotherapy management across 5+ specialty units, reducing prescription errors by 28%, and lowering irrational antibiotic usage by 22% through antimicrobial stewardship initiatives. She previously managed pharmacotherapy across Psychiatry, Medical ICU, Pediatric ICU, and Neonatal ICU.",
      "Dr. Ghazal brings an evidence-based, research-driven approach to mentorship — helping students master ICU pharmacotherapy, drug utilisation review, pharmacovigilance, and clinical research methodology.",
    ],
    photo: "/mentor-ghazal-naqvi.jpeg",
    experience: "13+ Years",
    domain: "Clinical Pharmacy",
    language: "English / Urdu",
    format: "Online via Zoom",
    pricePerSession: 6000,
    packages: [
      { name: "Single Session", sessions: 1, price: 6000 },
      { name: "3-Session Pack", sessions: 3, price: 16000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 26000, savings: 4000 },
    ],
    availability: "Sat, Sun 5PM",
    leadTime: "24 hours advance",
    credentials: [
      { title: "PhD in Pharmacy Practice", institution: "Jinnah University for Women", icon: "GraduationCap" },
      { title: "MPhil in Pharmacology", institution: "Jinnah University for Women", icon: "Award" },
      { title: "Assistant Professor", institution: "Fiji National University", icon: "BookOpen" },
    ],
    skills: [
      "ICU & Critical Care Pharmacotherapy",
      "Antimicrobial Stewardship Programs",
      "Medication Safety & Pharmacovigilance",
      "Drug Utilization Review (DUR)",
      "Clinical Research & Evidence-Based Medicine",
      "ADR Monitoring & Reporting",
    ],
  },
  {
    slug: "mehwish-kanwal",
    name: "Mehwish Kanwal",
    title: "Hospital Pharmacy & International Pharmacy Practice",
    expertise: "Hospital Pharmacy",
    shortBio: "AHPRA-registered pharmacist with 8+ years across UAE and Australia — former Senior Pharmacist at Kings College Hospital London Dubai, specialising in IV admixture, TPN, and transplant pharmacy.",
    fullBio: [
      "Mehwish Kanwal is an AHPRA-registered pharmacist (491 Visa, Victoria, Australia) with over 8 years of hospital pharmacy experience, primarily across leading hospitals in Dubai, UAE. She graduated with a Pharm-D from Islamia University Bahawalpur and built her career at Kings College Hospital London – Dubai, Medcare Women and Children Hospital, and Emirates Hospital.",
      "Her most recent senior role at Kings College Hospital London – Dubai included leading the Liver Transplant and Infection Control pharmacy departments, supervising IV admixture fluids and total parenteral nutrition (TPN) preparation, and implementing quality assurance systems that reduced medication errors. She is registered with AHPRA (Australia), Dubai Health Authority (UAE), and the Pharmacy Council of Pakistan.",
      "Mehwish offers mentees a genuinely international pharmacy perspective — guiding students who aspire to build pharmacy careers abroad, navigate international licensing pathways, and develop the clinical competencies that global employers value.",
    ],
    photo: "/mentor-mehwish-kanwal.jpeg",
    experience: "8+ Years",
    domain: "Hospital Pharmacy",
    language: "English / Urdu / Arabic",
    format: "Online via Zoom",
    pricePerSession: 6000,
    packages: [
      { name: "Single Session", sessions: 1, price: 6000 },
      { name: "3-Session Pack", sessions: 3, price: 16000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 26000, savings: 4000 },
    ],
    availability: "Flexible (contact to confirm)",
    leadTime: "48 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Islamia University Bahawalpur", icon: "GraduationCap" },
      { title: "Senior Pharmacist", institution: "Kings College Hospital London – Dubai, UAE", icon: "Award" },
      { title: "AHPRA Registered", institution: "Australian Pharmacy Council", icon: "BookOpen" },
    ],
    skills: [
      "Hospital Pharmacy (UAE & Australia)",
      "IV Admixture & TPN Preparation",
      "Liver Transplant & Infection Control Pharmacy",
      "Medication Reconciliation & Error Reduction",
      "International Pharmacy Licensing (AHPRA, DHA)",
      "Patient Counselling & Medication Safety",
    ],
  },
  {
    slug: "dr-maheen-waseem",
    name: "Dr. Maheen Waseem",
    title: "Infectious Diseases & Clinical Pharmacotherapy",
    expertise: "Pharmacotherapy",
    shortBio: "Incharge Clinical Pharmacist at Sindh Infectious Disease Hospital with 9+ years specialising in pharmacotherapy, AUC/MIC vancomycin, TPN, and antibiotic stewardship.",
    fullBio: [
      "Dr. Maheen Waseem is currently the Incharge of Clinical Pharmacy at Sindh Infectious Disease Hospital, with over 9 years of experience spanning infectious disease pharmacotherapy, IV dilutions, oncology pharmacy, and supply chain management. She previously served at Ziauddin Hospital (Oncology & ICU pharmacist), Child Life Foundation, and Liaquat National Hospital.",
      "Her clinical toolkit is exceptionally specialised: she initiated AUC/MIC optimisation therapy for vancomycin, established TPN and pediatric parenteral nutrition programs, developed antibiotic stewardship protocols, and set up controlled drug procedures per ministry of health guidelines. She holds certifications in Adult Infectious Disease (Aga Khan University), Sepsis Management (Berlin University), and is a certified Clinical Trial Pharmacist (USA).",
      "Dr. Maheen is a public speaker with internationally conducted sessions, and is driven by building strong clinical mindsets in her mentees — preparing them to handle complex, high-acuity cases with confidence and precision.",
    ],
    photo: "/mentor-dr-maheen-waseem.jpeg",
    experience: "9+ Years",
    domain: "Clinical Pharmacy",
    language: "English / Urdu",
    format: "Online via Google Meet",
    pricePerSession: 3000,
    packages: [
      { name: "Single Session", sessions: 1, price: 3000 },
      { name: "3-Session Pack", sessions: 3, price: 8000, savings: 1000 },
      { name: "5-Session Pack", sessions: 5, price: 13000, savings: 2000 },
    ],
    availability: "All Days Available",
    leadTime: "24 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Ziauddin University", icon: "GraduationCap" },
      { title: "Incharge Clinical Pharmacy", institution: "Sindh Infectious Disease Hospital", icon: "Award" },
      { title: "Clinical Trial Pharmacist", institution: "USA Certified", icon: "BookOpen" },
    ],
    skills: [
      "Clinical Pharmacotherapy",
      "AUC/MIC Vancomycin Optimization",
      "Total Parenteral Nutrition (TPN)",
      "Antibiotic Stewardship Programs",
      "IV Dilutions & Drug Calculations",
      "Supply Chain Management (SCOR Model)",
    ],
  },
  {
    slug: "imad-khan",
    name: "Imad Mohammad Khan",
    title: "Pharmaceutical Manufacturing & Industry Careers",
    expertise: "OSD Manufacturing",
    shortBio: "14+ years in pharma manufacturing and hospital pharmacy across Pakistan and Saudi Arabia — currently Supervisor OSD Manufacturing at Jamjoom Pharma, Jeddah.",
    fullBio: [
      "Imad Mohammad Khan is a Pharm-D pharmacist with over 14 years of experience spanning OSD (Oral Solid Dosage) manufacturing at Jamjoom Pharma, hospital pharmacy at Al-Mouwasat Hospital Dammam and Shifa Al-Khobar, and medical sales at Mothmir Corporation — all based in Saudi Arabia.",
      "His current role as Supervisor OSD Manufacturing at Jamjoom Pharma places him at the heart of GMP-regulated pharmaceutical production, overseeing tablet and capsule manufacturing, API and excipient documentation, and regulatory compliance per SOP guidelines. He holds a Saudi Commission for Health Specialties (SCHS) license as a practicing pharmacist.",
      "Imad is passionate about connecting Pakistani pharmacists to global opportunities in the Gulf, sharing his network and real-world insights on breaking into Saudi pharma manufacturing, hospital pharmacy, and medical sales.",
    ],
    photo: "/mentor-imad-khan.png",
    experience: "14+ Years",
    domain: "Pharmaceutical Industry",
    language: "English / Arabic / Urdu",
    format: "Online via Zoom",
    pricePerSession: 3000,
    packages: [
      { name: "Single Session", sessions: 1, price: 3000 },
      { name: "3-Session Pack", sessions: 3, price: 8000, savings: 1000 },
      { name: "5-Session Pack", sessions: 5, price: 13000, savings: 2000 },
    ],
    availability: "Fri (Full Day)",
    leadTime: "48 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Baqai Institute of Pharmaceutical Sciences", icon: "GraduationCap" },
      { title: "Supervisor OSD Manufacturing", institution: "Jamjoom Pharma, Saudi Arabia", icon: "Award" },
      { title: "Hospital Pharmacy", institution: "Al-Mouwasat Hospital, Saudi Arabia", icon: "BookOpen" },
    ],
    skills: [
      "OSD Pharmaceutical Manufacturing",
      "GMP & Quality Assurance",
      "Hospital Pharmacy (Gulf Region)",
      "Medical Sales & Key Account Management",
      "Career Guidance for Middle East",
      "Regulatory Compliance & SOP Implementation",
    ],
  },
  {
    slug: "laiq-ur-rehman",
    name: "Laiq-Ur-Rehman Khan",
    title: "Forensic Pharmacy, Drug Regulation & Exam Preparation",
    expertise: "Forensic Pharmacy",
    shortBio: "Drug Inspector (District Kasur) with 9 years in forensic pharmacy and regulation — author of 4 pharmacy books and founder of Pharmacy Exam Guide (PEG).",
    fullBio: [
      "Laiq-Ur-Rehman Khan is a Drug Inspector posted at Tehsil Chunian, District Kasur (PPSC Batch 2018) under the Health & Population Department. He previously served as Hospital Pharmacist at THQ Hospital Phalia, District Mandi Bahauddin, where he also acted as Focal Person for COVID-19 response, the IRMNCH Program, and hospital media communications.",
      "Beyond his regulatory career, Laiq is an accomplished author of 4 pharmacy books published under the Pharmacy Exam Guide (PEG) brand — including titles on Forensic Pharmacy, Pharma Asset, model papers, and exam preparation for Procurement/Admin Officers. He also runs the Pharmacy Exam Guide YouTube channel, a widely used resource for pharmacists preparing for PPSC and government service examinations.",
      "His mentorship uniquely bridges regulatory expertise and exam strategy — ideal for students targeting government pharmacy careers, drug inspection roles, PPSC exams, or careers in pharmaceutical policy and drug regulatory affairs.",
    ],
    photo: "/mentor-laiq-ur-rehman.jpeg",
    experience: "9 Years",
    domain: "Pharmacy Law & Regulation",
    language: "English / Urdu",
    format: "Online via Google Meet",
    pricePerSession: 5000,
    packages: [
      { name: "Single Session", sessions: 1, price: 5000 },
      { name: "3-Session Pack", sessions: 3, price: 13000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 21000, savings: 4000 },
    ],
    availability: "Flexible (contact to confirm)",
    leadTime: "24 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Pakistan", icon: "GraduationCap" },
      { title: "Drug Inspector", institution: "Health & Population Dept, District Kasur", icon: "Award" },
      { title: "Author of 4 Pharmacy Books", institution: "Pharmacy Exam Guide (PEG)", icon: "BookOpen" },
    ],
    skills: [
      "Forensic Pharmacy",
      "Drug Regulatory Affairs",
      "Pharmacy Law & Ethics",
      "PPSC & Government Exam Preparation",
      "Pharmacy Books & Content Creation",
      "Government Pharmacy Careers",
    ],
  },
  {
    slug: "dr-aftab-alam",
    name: "Dr. Aftab Alam",
    title: "Entrepreneurship & Medication Counselling",
    expertise: "Entrepreneurship",
    shortBio: "CEO of Pharmacozyme with 5 years building pharmacy-focused ventures and mentoring professionals.",
    fullBio: [
      "Dr. Aftab Alam is the CEO of Pharmacozyme, a pharmacy-focused organization he has built over 5 years. His unique blend of clinical training and entrepreneurial execution gives him a perspective that few pharmacy mentors can offer.",
      "His expertise spans medication counselling and entrepreneurship — helping students understand not just how to practice pharmacy, but how to build something around it. He has first-hand experience navigating the challenges of starting and scaling a health-focused business in Pakistan.",
      "Dr. Aftab mentors aspiring pharmacist-entrepreneurs who want to go beyond traditional career paths and create their own opportunities in the pharmacy and healthcare space.",
    ],
    photo: "/mentor-aftab-alam.jpeg",
    experience: "5 Years",
    domain: "Pharmacy & Entrepreneurship",
    language: "English / Urdu",
    format: "Online via Google Meet",
    pricePerSession: 3000,
    packages: [
      { name: "Single Session", sessions: 1, price: 3000 },
      { name: "3-Session Pack", sessions: 3, price: 8000, savings: 1000 },
      { name: "5-Session Pack", sessions: 5, price: 13000, savings: 2000 },
    ],
    availability: "Any Time",
    leadTime: "24 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Pakistan", icon: "GraduationCap" },
      { title: "CEO", institution: "Pharmacozyme", icon: "Award" },
      { title: "Medication Counselling", institution: "Pakistan", icon: "BookOpen" },
    ],
    skills: [
      "Pharmacy Entrepreneurship",
      "Medication Counselling",
      "Business Development",
      "Healthcare Startups",
      "Team Leadership",
      "Career Pivoting for Pharmacists",
    ],
  },
  {
    slug: "dr-hamza-ansari",
    name: "Dr. Hamza Ansari",
    title: "Entrepreneurship, Digital Marketing & Agentic AI",
    expertise: "Entrepreneurship",
    shortBio: "COO of Pharmacozyme — pharmacist turned tech entrepreneur specialising in AI, branding, and digital marketing.",
    fullBio: [
      "Dr. Hamza Ansari is the COO of Pharmacozyme and one of the most multi-disciplinary pharmacists in Pakistan's emerging tech scene. With 5+ years of experience, he bridges the worlds of pharmacy, digital marketing, content creation, web & app development, and agentic AI.",
      "His work at Pharmacozyme has put him at the intersection of healthcare and technology — building systems, brands, and workflows that leverage the latest in AI automation. He brings a rare combination of clinical understanding and deep tech execution.",
      "Dr. Hamza mentors students who want to future-proof their pharmacy careers by developing skills in branding, digital presence, and AI-powered tools — the competencies that will define the next generation of healthcare professionals.",
    ],
    photo: "/mentor-hamza-ansari.jpeg",
    experience: "5+ Years",
    domain: "Pharmacy & Technology",
    language: "English / Urdu",
    format: "Online via Zoom",
    pricePerSession: 6000,
    packages: [
      { name: "Single Session", sessions: 1, price: 6000 },
      { name: "3-Session Pack", sessions: 3, price: 16000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 26000, savings: 4000 },
    ],
    availability: "12–2 PM & 8–11 PM",
    leadTime: "24 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Pakistan", icon: "GraduationCap" },
      { title: "COO", institution: "Pharmacozyme", icon: "Award" },
      { title: "Agentic AI & Automations", institution: "Self-taught", icon: "BookOpen" },
    ],
    skills: [
      "Entrepreneurship & Branding",
      "Digital Marketing",
      "Content Creation & Coaching",
      "Web & App Development",
      "Agentic AI & Automations",
      "Career Development for Pharmacists",
    ],
  },
];

export function getMentorBySlug(slug: string): Mentor | undefined {
  return mentors.find((m) => m.slug === slug);
}

export function formatPrice(price: number): string {
  return `PKR ${price.toLocaleString("en-PK")}`;
}
