import { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import BookingClient from "@/components/mentorship/BookingClient";
import { getMentorBySlug, mentors } from "@/lib/mentorship/mentors";

interface Props {
  params: { slug: string };
}

export async function generateStaticParams() {
  return mentors.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mentor = getMentorBySlug(params.slug);
  if (!mentor) return {};
  return {
    title: `Book a Session – ${mentor.name} | PZ Academy`,
    description: `Book a 1-on-1 mentorship session with ${mentor.name}. ${mentor.shortBio}`,
    robots: "noindex",
  };
}

export default function BookPage({ params }: Props) {
  const mentor = getMentorBySlug(params.slug);
  if (!mentor) notFound();

  return (
    <>
      <MarketingNav />
      <main>
        <BookingClient mentor={mentor!} />
      </main>
      <MarketingFooter />
    </>
  );
}
