import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/require-mentor";
import { resolveStudentDisplay, getConversationForMentor, markConversationRead } from "@/lib/data/mentor-messaging";
import { MessageThread } from "@/components/messaging/MessageThread";

export const metadata = { title: "Conversation — PZ Academy" };

export default async function MentorMessageThreadPage({ params }: { params: Promise<{ studentId: string }> }) {
  const { user } = await requireMentorPage();
  const { studentId } = await params;

  const student = await resolveStudentDisplay(studentId);
  if (!student) notFound();

  const thread = await getConversationForMentor(user.id, studentId);
  if (!thread.canMessage && !thread.conversationId) notFound();
  if (thread.conversationId) {
    await markConversationRead(thread.conversationId, "mentor");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/mentor/messages"
        className="inline-flex items-center gap-1.5 font-label text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Messages
      </Link>
      <MessageThread
        conversationId={thread.conversationId}
        initialMessages={thread.messages}
        currentUserId={user.id}
        counterpartName={student.name}
        canMessage={thread.canMessage}
        sendUrl={`/api/mentor/messages/${studentId}`}
      />
    </div>
  );
}
