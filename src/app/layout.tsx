import type { Metadata } from "next";
import { Montserrat, Poppins, Allura } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const allura = Allura({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-allura",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PZ Academy – Excellence through Mentorship & Learning",
  description:
    "The official hub for PZ Academy programs. Explore our Mentorship Program, find verified industry experts, and accelerate your career.",
  keywords: ["PZ Academy", "mentorship", "learning", "professional development", "Pakistan experts"],
  openGraph: {
    title: "PZ Academy – Excellence through Mentorship & Learning",
    description: "The official hub for PZ Academy programs.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${montserrat.variable} ${poppins.variable} ${allura.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
