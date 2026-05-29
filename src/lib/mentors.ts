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
    pricePerSession: 5000,
    packages: [
      { name: "Single Session", sessions: 1, price: 5000 },
      { name: "3-Session Pack", sessions: 3, price: 13000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 21000, savings: 4000 },
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
    title: "Pharmacology & Clinical Pharmacy",
    expertise: "Clinical Pharmacy",
    shortBio: "Assistant Professor with 13 years in pharmacology and pharmacy practice across international institutions.",
    fullBio: [
      "Ghazal Naqvi is an Assistant Professor at Fiji National University with 13 years of experience teaching Pharmacology, Pharmacy Practice, and Clinical Pharmacy. Her academic career spans multiple countries, giving her a uniquely international perspective on pharmacy education.",
      "She is passionate about conducting webinars and interactive sessions that help students choose the right career path and grow the pharmacy profession globally. Her teaching style is practical, conversational, and student-first.",
      "Ghazal mentors students on subject mastery, career direction, and professional development — helping them navigate the full spectrum from academia to clinical practice.",
    ],
    photo: "/mentor-ghazal-naqvi.jpeg",
    experience: "13 Years",
    domain: "Pharmacy & Academia",
    language: "English",
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
      { title: "Assistant Professor", institution: "Fiji National University", icon: "GraduationCap" },
      { title: "Pharmacy Practice", institution: "International", icon: "Award" },
      { title: "Clinical Pharmacy", institution: "International", icon: "BookOpen" },
    ],
    skills: [
      "Pharmacology",
      "Pharmacy Practice",
      "Clinical Pharmacy",
      "Career Counselling",
      "Webinars & Online Teaching",
      "Professional Development",
    ],
  },
  {
    slug: "mehwish-kanwal",
    name: "Mehwish Kanwal",
    title: "Community & Hospital Pharmacy",
    expertise: "Pharmacology",
    shortBio: "Senior Pharmacist based in Australia with 13 years across community and hospital pharmacy settings.",
    fullBio: [
      "Mehwish Kanwal is a Senior Pharmacist with 13 years of experience, currently based in Australia. She trained at Islamia University Bahawalpur and has built a career spanning community pharmacy, hospital pharmacy, and pharmacology.",
      "Her international career gives her mentees access to global pharmacy standards — from Australian dispensing protocols to hospital formulary management — an invaluable perspective for students aspiring to work abroad.",
      "Mehwish mentors students on building a pharmacy career that travels, understanding international licensing pathways, and developing the clinical competencies that global employers value.",
    ],
    photo: "/mentor-mehwish-kanwal.jpeg",
    experience: "13 Years",
    domain: "Pharmacy",
    language: "English / Urdu",
    format: "Online via Zoom",
    pricePerSession: 7000,
    packages: [
      { name: "Single Session", sessions: 1, price: 7000 },
      { name: "3-Session Pack", sessions: 3, price: 19000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 30000, savings: 5000 },
    ],
    availability: "Flexible (contact to confirm)",
    leadTime: "48 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Islamia University Bahawalpur", icon: "GraduationCap" },
      { title: "Senior Pharmacist", institution: "Australia", icon: "Award" },
      { title: "Hospital Pharmacy", institution: "International", icon: "BookOpen" },
    ],
    skills: [
      "Community Pharmacy",
      "Hospital Pharmacy",
      "Pharmacology",
      "International Pharmacy Licensing",
      "Drug Dispensing & Counselling",
      "Career Guidance for Abroad",
    ],
  },
  {
    slug: "dr-maheen-waseem",
    name: "Dr. Maheen Waseem",
    title: "Infectious Diseases & Clinical Pharmacotherapy",
    expertise: "Pharmacotherapy",
    shortBio: "ID Pharmacist at Dow University with 9+ years specialising in pharmacotherapy and infectious disease management.",
    fullBio: [
      "Dr. Maheen Waseem is an Infectious Diseases (ID) Pharmacist at Dow University Hospital with over 9 years of experience in clinical pharmacotherapy, IV dilutions, and infectious disease management. She works on the front lines of complex, high-acuity patient care.",
      "Her clinical expertise in pharmacotherapy — the practical application of drug therapy to optimise patient outcomes — is highly sought after by students wanting to move beyond memorisation into real clinical thinking.",
      "Dr. Maheen is driven by a desire to build a strong mindset in her mentees, preparing them to handle challenging cases with confidence and clarity.",
    ],
    photo: "/mentor-dr-maheen-waseem.jpeg",
    experience: "9+ Years",
    domain: "Clinical Pharmacy",
    language: "English / Urdu",
    format: "Online via Google Meet",
    pricePerSession: 6000,
    packages: [
      { name: "Single Session", sessions: 1, price: 6000 },
      { name: "3-Session Pack", sessions: 3, price: 16000, savings: 2000 },
      { name: "5-Session Pack", sessions: 5, price: 26000, savings: 4000 },
    ],
    availability: "All Days Available",
    leadTime: "24 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Dow University", icon: "GraduationCap" },
      { title: "ID Pharmacist", institution: "Dow University Hospital", icon: "Award" },
      { title: "Clinical Pharmacotherapy", institution: "Pakistan", icon: "BookOpen" },
    ],
    skills: [
      "Clinical Pharmacotherapy",
      "Infectious Disease Management",
      "IV Dilutions & Drug Calculations",
      "Medication Optimisation",
      "Case-Based Clinical Reasoning",
      "Hospital Pharmacy Practice",
    ],
  },
  {
    slug: "imad-khan",
    name: "Imad Mohammad Khan",
    title: "Pharmaceutical Manufacturing & Industry Careers",
    expertise: "OSD Manufacturing",
    shortBio: "14 years in pharma manufacturing and hospital pharmacy across Pakistan, Saudi Arabia, and the Middle East.",
    fullBio: [
      "Imad Mohammad Khan is a seasoned pharmacist with 14 years of experience spanning OSD (Oral Solid Dosage) manufacturing at Jamjoom Pharma, hospital pharmacy at Mouwasat Hospital, and teaching at Baqai Medical University — all in Saudi Arabia and the wider Middle East.",
      "His career is a masterclass in the breadth of pharmacy: from GMP-regulated manufacturing floors to hospital formularies to academic lecturing. He has deep knowledge of the Gulf pharmaceutical market and what it takes to build a career there.",
      "Imad is passionate about connecting young Pakistani pharmacists to global opportunities, sharing his network and real-world insights on breaking into the Middle East pharma industry.",
    ],
    photo: "/mentor-imad-khan.png",
    experience: "14 Years",
    domain: "Pharmaceutical Industry",
    language: "English / Urdu",
    format: "Online via Zoom",
    pricePerSession: 8000,
    packages: [
      { name: "Single Session", sessions: 1, price: 8000 },
      { name: "3-Session Pack", sessions: 3, price: 21000, savings: 3000 },
      { name: "5-Session Pack", sessions: 5, price: 34000, savings: 6000 },
    ],
    availability: "Fri (Full Day)",
    leadTime: "48 hours advance",
    credentials: [
      { title: "Pharm-D", institution: "Baqai Medical University", icon: "GraduationCap" },
      { title: "OSD Manufacturing", institution: "Jamjoom Pharma, Saudi Arabia", icon: "Award" },
      { title: "Hospital Pharmacy", institution: "Mouwasat Hospital", icon: "BookOpen" },
    ],
    skills: [
      "OSD Pharmaceutical Manufacturing",
      "GMP & Quality Assurance",
      "Hospital Pharmacy (Gulf Region)",
      "Cosmetic & Consumer Health Markets",
      "Career Guidance for Middle East",
      "Industry & Academia Bridging",
    ],
  },
  {
    slug: "laiq-ur-rehman",
    name: "Laiq-Ur-Rehman Khan",
    title: "Forensic Pharmacy & Drug Regulation",
    expertise: "Forensic Pharmacy",
    shortBio: "Drug Inspector with 9 years in pharmacy law, forensic pharmacy, and regulatory affairs.",
    fullBio: [
      "Laiq-Ur-Rehman Khan is a Drug Inspector at the Health & Population Department with 9 years of experience in forensic pharmacy and pharmacy practice regulation. He enforces drug laws, investigates pharmaceutical violations, and ensures public safety through regulatory compliance.",
      "Forensic pharmacy is a niche but growing field — covering the legal, ethical, and investigative dimensions of the profession. Laiq brings this rarely-taught perspective to students who want to understand pharmacy beyond the dispensary.",
      "His mentorship focuses on pharmacy law, drug regulatory affairs, and career pathways in government and regulatory bodies — ideal for students interested in the policy and enforcement side of pharmacy.",
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
      { title: "Drug Inspector", institution: "Health & Population Department", icon: "Award" },
      { title: "Forensic Pharmacy", institution: "Pakistan", icon: "BookOpen" },
    ],
    skills: [
      "Forensic Pharmacy",
      "Drug Regulatory Affairs",
      "Pharmacy Law & Ethics",
      "Drug Inspection Procedures",
      "Government Pharmacy Careers",
      "Pharmaceutical Policy",
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
