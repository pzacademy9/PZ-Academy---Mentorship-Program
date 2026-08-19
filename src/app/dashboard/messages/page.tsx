import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { listConversationsForStudent } from "@/lib/data/mentor-messaging";
import { ConversationList } from "@/components/messaging/ConversationList";

export const metadata = { title: "Messages — PZ Academy" };

export default async function StudentMessagesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const conversations = await listConversationsForStudent(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Messages</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">Your conversations with mentors.</p>
      </div>
      <ConversationList
        conversations={conversations}
        emptyMessage="No conversations yet — book a session with a mentor to start chatting."
      />
    </div>
  );
}
