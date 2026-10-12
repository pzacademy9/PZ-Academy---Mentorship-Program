// src/app/e/layout.tsx
import { Inter } from "next/font/google";

// Inter is the landing pages' body face; it is loaded here so it only ships on /e/* and the
// rest of the app is unaffected. tailwind.config.ts maps `font-landing-body` to var(--font-inter).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className={inter.variable}>{children}</div>;
}
