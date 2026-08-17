import { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import MentorProfileClient from "@/components/mentorship/MentorProfileClient";
import { getPublicMentorBySlug } from "@/lib/data/mentors";
import { getMentorReviewSummary, listMentorReviews } from "@/lib/data/mentor-reviews";

interface Props {
  params: Promise<{ slug: string }>;
}

// No generateStaticParams: mentors are DB-driven now (mentor registry,
// supabase/migrations/0028_mentor_registry.sql). getPublicMentorBySlug uses
// createServerSupabase(), which calls cookies() and opts this route out of
// static rendering anyway — the same fully-dynamic pattern already used by
// /courses/[slug] and /webinars. A newly published mentor appears on the
// very next request with no rebuild.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const mentor = await getPublicMentorBySlug(slug);
  if (!mentor) return {};
  return {
    title: `${mentor.name} – PZ Academy Mentor | ${mentor.expertise}`,
    description: mentor.shortBio,
  };
}

export default async function MentorPage({ params }: Props) {
  const { slug } = await params;
  const mentor = await getPublicMentorBySlug(slug);
  if (!mentor) notFound();

  // Fetched here (Server Component) and passed down as props — MentorProfileClient
  // is a "use client" tree, so getMentorReviewSummary/listMentorReviews (both
  // server-only) can't be called directly inside it. See task-4-brief.md Step 7.
  const [reviewSummary, reviews] = await Promise.all([
    getMentorReviewSummary(mentor.id),
    listMentorReviews(mentor.id, { limit: 8 }),
  ]);

  return (
    <>
      <MarketingNav alwaysSolid />
      <main>
        <MentorProfileClient mentor={mentor} reviewSummary={reviewSummary} reviews={reviews} />
      </main>
      <MarketingFooter />
    </>
  );
}
