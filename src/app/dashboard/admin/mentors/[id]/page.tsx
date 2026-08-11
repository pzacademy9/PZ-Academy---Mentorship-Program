import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getMentorConfig } from "@/lib/data/admin-mentors";
import { MentorConfigForm } from "@/components/admin/mentors/MentorConfigForm";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mentor = await getMentorConfig(id);
  return { title: mentor ? `${mentor.name} — PZ Academy Admin` : "Mentor — PZ Academy" };
}

export default async function MentorConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const mentor = await getMentorConfig(id);
  if (!mentor) notFound();

  return (
    <div className="max-w-4xl">
      <MentorConfigForm mentor={mentor} />
    </div>
  );
}
