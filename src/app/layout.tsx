import type { Metadata } from "next";
import { Montserrat, Poppins, Fredoka, Handlee } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

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

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
});

const handlee = Handlee({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-handlee",
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          montserrat.variable,
          poppins.variable,
          fredoka.variable,
          handlee.variable,
          "font-fredoka bg-white text-pz-ink dark:bg-[#101412] dark:text-[#e0e3df] antialiased",
        )}
      >
        <ThemeProvider>
          {children}
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
