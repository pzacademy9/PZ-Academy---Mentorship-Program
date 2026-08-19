import { requireMentorPage } from "@/lib/auth/require-mentor";
import { listConversationsForMentor } from "@/lib/data/mentor-messaging";
import { ConversationList } from "@/components/messaging/ConversationList";

export const metadata = { title: "Messages — PZ Academy" };

export default async function MentorMessagesPage() {
  const { user } = await requireMentorPage();
  const conversations = await listConversationsForMentor(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Messages</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Conversations with your students.</p>
      </div>
      <ConversationList conversations={conversations} emptyMessage="No conversations yet." />
    </div>
  );
}
