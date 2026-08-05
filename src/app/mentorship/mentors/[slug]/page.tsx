import { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import MentorProfileClient from "@/components/mentorship/MentorProfileClient";
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
    title: `${mentor.name} – PZ Academy Mentor | ${mentor.expertise}`,
    description: mentor.shortBio,
  };
}

export default function MentorPage({ params }: Props) {
  const mentor = getMentorBySlug(params.slug);
  if (!mentor) notFound();

  return (
    <>
      <MarketingNav />
      <main>
        {/* mentor is non-null here after notFound() above */}
        <MentorProfileClient mentor={mentor!} />
      </main>
      <MarketingFooter />
    </>
  );
}
