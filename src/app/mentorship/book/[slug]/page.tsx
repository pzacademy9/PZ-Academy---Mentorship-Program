import { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import BookingClient from "@/components/mentorship/BookingClient";
import { getPublicMentorBySlug } from "@/lib/data/mentors";
import { getMentorReviewSummary } from "@/lib/data/mentor-reviews";
import { pickPackage } from "@/lib/mentorship/booking";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ package?: string | string[] }>;
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

export default async function BookPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const mentor = await getPublicMentorBySlug(slug);
  if (!mentor) notFound();
  // The package chosen on the profile page; ignored unless this mentor really offers it.
  const requested = (await searchParams)?.package;
  // Stars in the summary are a nice extra: a reviews hiccup must never block a booking.
  const reviewSummary = mentor.showReviews ? await getMentorReviewSummary(mentor.id).catch(() => undefined) : undefined;

  return (
    <>
      <MarketingNav />
      <main>
        <BookingClient mentor={mentor} initialPackage={pickPackage(mentor.packages, requested)} reviewSummary={reviewSummary} />
      </main>
      <MarketingFooter />
    </>
  );
}
