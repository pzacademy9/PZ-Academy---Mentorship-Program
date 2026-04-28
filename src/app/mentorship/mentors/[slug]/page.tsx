import { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MentorProfileClient from "@/components/MentorProfileClient";
import { getMentorBySlug, mentors } from "@/lib/mentors";

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
      <Navbar />
      <main>
        {/* mentor is non-null here after notFound() above */}
        <MentorProfileClient mentor={mentor!} />
      </main>
      <Footer />
    </>
  );
}
