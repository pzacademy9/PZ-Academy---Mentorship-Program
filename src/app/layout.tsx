import type { Metadata } from "next";
import { Montserrat, Poppins } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-montserrat",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
});


export const metadata: Metadata = {
  title: "PZ Academy — Educating with Innovation",
  description:
    "PZ Academy by Pharmacozyme — structured pharmacy courses, expert mentorship, live workshops, webinars, and career development for medical and health sciences professionals.",
  openGraph: {
    title: "PZ Academy — Educating with Innovation",
    description: "Medical & health sciences education platform by Pharmacozyme.",
    siteName: "PZ Academy",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn(montserrat.variable, poppins.variable, "font-poppins bg-white text-pz-ink antialiased")}>
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
