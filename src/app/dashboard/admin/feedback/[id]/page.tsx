import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";
import { listMentorsForLinking } from "@/lib/data/admin-mentors";
import { SessionDetailClient } from "./SessionDetailClient";

export const metadata = { title: "Session Detail — PZ Academy" };

export default async function AdminFeedbackSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;
  const [detail, mentors] = await Promise.all([getFeedbackSessionDetail(id), listMentorsForLinking()]);
  if (!detail) notFound();

  return (
    <SessionDetailClient
      session={detail.session}
      perQuestion={detail.perQuestion}
      responses={detail.responses}
      mentors={mentors}
    />
  );
}
