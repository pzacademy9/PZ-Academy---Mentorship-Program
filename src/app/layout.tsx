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
  title: "PZ Academy Mentorship – Find Your Expert Mentor",
  description:
    "Connect with PZ Academy's verified industry experts for 1-on-1 mentorship sessions. Accelerate your growth with personalized, professional guidance.",
  keywords: ["PZ Academy", "mentorship", "mentor", "1-on-1 sessions", "professional guidance"],
  openGraph: {
    title: "PZ Academy Mentorship – Find Your Expert Mentor",
    description: "Connect with verified experts for 1-on-1 guidance.",
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
