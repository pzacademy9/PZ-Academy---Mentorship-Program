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
    slug: "dr-ahmed-khan",
    name: "Dr. Ahmed Khan",
    title: "Strategic Finance & Executive Leadership",
    expertise: "Strategic Finance",
    shortBio: "Former CFO with 20+ years navigating global markets and scaling enterprises.",
    fullBio: [
      "Dr. Ahmed Khan is a globally recognized authority in strategic finance and corporate restructuring. With over two decades of experience advising Fortune 500 companies across South Asia, the Middle East, and Europe, he brings a rigorous analytical approach to executive leadership.",
      "His mentorship focuses on bridging the gap between theoretical financial models and practical, high-stakes decision-making in volatile markets. Dr. Khan has successfully guided 50+ executives through complex M&A integrations, capital raising efforts, and financial turnarounds.",
      "He is passionate about developing the next generation of Pakistani finance leaders, combining local market insight with global best practices.",
    ],
    photo: "/mentor-ahmed.jpeg",
    experience: "20+ Years",
    domain: "Global Finance",
    language: "English / Urdu",
    format: "Online via Zoom",
    pricePerSession: 15000,
    packages: [
      { name: "Single Session", sessions: 1, price: 15000 },
      { name: "3-Session Pack", sessions: 3, price: 40000, savings: 5000 },
      { name: "5-Session Pack", sessions: 5, price: 65000, savings: 10000 },
    ],
    availability: "Mon–Thu, 7PM–10PM PKT",
    leadTime: "48 hours advance",
    credentials: [
      { title: "MBA", institution: "LUMS", icon: "GraduationCap" },
      { title: "CFA Charterholder", institution: "CFA Institute", icon: "Award" },
      { title: "Ph.D. Economics", institution: "University of London", icon: "BookOpen" },
    ],
    skills: [
      "M&A Strategy & Integration",
      "Advanced Capital Raising",
      "CFO Advisory Services",
      "Corporate Restructuring",
      "Financial Modeling & Valuation",
      "Executive Communication",
    ],
  },
  {
    slug: "sara-malik",
    name: "Sara Malik",
    title: "Product Leadership & Growth Strategy",
    expertise: "Product Leadership",
    shortBio: "VP of Product specializing in zero-to-one launches and cross-functional team building.",
    fullBio: [
      "Sara Malik is a seasoned product leader with 12 years of experience building market-defining products in Pakistan's tech ecosystem and beyond. As VP of Product at a Series-B fintech startup, she led a team of 30 across product, design, and engineering.",
      "Her mentorship approach is rooted in first-principles thinking — helping mentees break down complex product problems, identify true user needs, and build roadmaps that align with business strategy.",
      "Sara is deeply invested in empowering women in tech and building a world-class product community in Pakistan.",
    ],
    photo: "/mentor-sara.jpeg",
    experience: "12 Years",
    domain: "Product & Growth",
    language: "English / Urdu",
    format: "Online via Google Meet",
    pricePerSession: 12000,
    packages: [
      { name: "Single Session", sessions: 1, price: 12000 },
      { name: "3-Session Pack", sessions: 3, price: 32000, savings: 4000 },
      { name: "5-Session Pack", sessions: 5, price: 52000, savings: 8000 },
    ],
    availability: "Tue–Sat, 6PM–9PM PKT",
    leadTime: "24 hours advance",
    credentials: [
      { title: "MBA", institution: "IBA Karachi", icon: "GraduationCap" },
      { title: "Google PM Cert", institution: "Google", icon: "Award" },
      { title: "IDEO Design Thinking", institution: "IDEO", icon: "Lightbulb" },
    ],
    skills: [
      "Product Strategy & Roadmapping",
      "User Research & Validation",
      "Growth & Retention Loops",
      "Cross-functional Team Leadership",
      "OKR Frameworks",
      "Go-to-Market Strategy",
    ],
  },
  {
    slug: "usman-sheikh",
    name: "Usman Sheikh",
    title: "Digital Marketing & Brand Strategy",
    expertise: "Digital Marketing",
    shortBio: "Built 3 7-figure brands from scratch — now helping others do the same.",
    fullBio: [
      "Usman Sheikh is a performance marketer turned brand strategist who has scaled three consumer brands to 7-figure annual revenue using digital-first strategies. He has worked with 50+ brands across Pakistan, UAE, and the UK.",
      "His sessions focus on performance marketing fundamentals, brand positioning, and building sustainable customer acquisition engines without burning ad budgets.",
      "Usman believes great marketing starts with a clear message and a deep understanding of human psychology.",
    ],
    photo: "/mentor-usman.jpeg",
    experience: "10 Years",
    domain: "Marketing & Branding",
    language: "English / Urdu",
    format: "Online via Zoom",
    pricePerSession: 8000,
    packages: [
      { name: "Single Session", sessions: 1, price: 8000 },
      { name: "3-Session Pack", sessions: 3, price: 21000, savings: 3000 },
      { name: "5-Session Pack", sessions: 5, price: 34000, savings: 6000 },
    ],
    availability: "Mon–Fri, 8PM–11PM PKT",
    leadTime: "24 hours advance",
    credentials: [
      { title: "Meta Blueprint", institution: "Meta", icon: "Award" },
      { title: "Google Ads Cert", institution: "Google", icon: "TrendingUp" },
      { title: "HubSpot Content", institution: "HubSpot", icon: "BookOpen" },
    ],
    skills: [
      "Performance Marketing (Meta/Google)",
      "Brand Identity & Positioning",
      "Content Strategy & SEO",
      "Email Marketing & Automation",
      "Conversion Rate Optimization",
      "Social Media Strategy",
    ],
  },
];

export function getMentorBySlug(slug: string): Mentor | undefined {
  return mentors.find((m) => m.slug === slug);
}

export function formatPrice(price: number): string {
  return `PKR ${price.toLocaleString("en-PK")}`;
}
