import { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BookingClient from "@/components/BookingClient";
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
      <Navbar />
      <main>
        <BookingClient mentor={mentor!} />
      </main>
      <Footer />
    </>
  );
}
