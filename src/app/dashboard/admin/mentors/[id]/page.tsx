import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getMentorConfig } from "@/lib/data/admin-mentors";
import { getLinkedAccountEmail } from "@/lib/data/mentor-accounts";
import { MentorConfigForm } from "@/components/admin/mentors/MentorConfigForm";
import { MentorAccountCard } from "@/components/admin/mentors/MentorAccountCard";

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

  const linkedEmail = await getLinkedAccountEmail(mentor.profileId);

  return (
    <div className="max-w-4xl space-y-6">
      <MentorAccountCard mentorId={mentor.id} linkedEmail={linkedEmail} />
      <MentorConfigForm mentor={mentor} />
    </div>
  );
}
