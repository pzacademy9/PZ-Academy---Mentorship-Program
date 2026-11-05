import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { ThankYouClient } from "@/components/mentorship/ThankYouClient";
import { parseBookingRef } from "@/lib/mentorship/booking";

export const metadata: Metadata = {
  title: "Booking received | PZ Academy",
  robots: "noindex",
};

export default async function ThankYouPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams;
  return (
    <>
      <MarketingNav />
      <main>
        <ThankYouClient refCode={parseBookingRef(ref)} />
      </main>
      <MarketingFooter />
    </>
  );
}
