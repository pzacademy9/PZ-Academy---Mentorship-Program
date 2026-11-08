// src/app/affiliate/[token]/layout.tsx
import { Inter } from "next/font/google";

// Same body face as the apply page and the landing pages; loaded here so it only ships on this page.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export default function AffiliatePrivateLayout({ children }: { children: React.ReactNode }) {
  return <div className={inter.variable}>{children}</div>;
}
