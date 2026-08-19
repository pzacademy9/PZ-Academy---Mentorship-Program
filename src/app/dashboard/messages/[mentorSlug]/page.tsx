import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveMentorForMessaging, getConversationForStudent, markConversationRead } from "@/lib/data/mentor-messaging";
import { MessageThread } from "@/components/messaging/MessageThread";

export const metadata = { title: "Conversation — PZ Academy" };

export default async function StudentMessageThreadPage({ params }: { params: Promise<{ mentorSlug: string }> }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { mentorSlug } = await params;
  const mentor = await resolveMentorForMessaging(mentorSlug);
  if (!mentor) notFound();

  const thread = await getConversationForStudent(user.id, mentor.profileId);
  if (thread.conversationId) {
    await markConversationRead(thread.conversationId, "student");
  }

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1.5 font-label text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Messages
      </Link>
      <MessageThread
        conversationId={thread.conversationId}
        initialMessages={thread.messages}
        currentUserId={user.id}
        counterpartName={mentor.name}
        canMessage={thread.canMessage}
        sendUrl={`/api/messages/${mentorSlug}`}
      />
    </div>
  );
}
