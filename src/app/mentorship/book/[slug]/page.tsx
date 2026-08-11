import { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import BookingClient from "@/components/mentorship/BookingClient";
import { getPublicMentorBySlug } from "@/lib/data/mentors";

interface Props {
  params: Promise<{ slug: string }>;
}

// See mentors/[slug]/page.tsx for why there's no generateStaticParams here.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const mentor = await getPublicMentorBySlug(slug);
  if (!mentor) return {};
  return {
    title: `Book a Session – ${mentor.name} | PZ Academy`,
    description: `Book a 1-on-1 mentorship session with ${mentor.name}. ${mentor.shortBio}`,
    robots: "noindex",
  };
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params;
  const mentor = await getPublicMentorBySlug(slug);
  if (!mentor) notFound();

  return (
    <>
      <MarketingNav />
      <main>
        <BookingClient mentor={mentor} />
      </main>
      <MarketingFooter />
    </>
  );
}
