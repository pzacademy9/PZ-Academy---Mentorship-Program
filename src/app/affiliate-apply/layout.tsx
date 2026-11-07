// src/app/affiliate-apply/layout.tsx
import { Inter } from "next/font/google";

// Same body face as the landing pages; loaded here so it only ships on /affiliate-apply/*.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default function AffiliateApplyLayout({ children }: { children: React.ReactNode }) {
  return <div className={inter.variable}>{children}</div>;
}
