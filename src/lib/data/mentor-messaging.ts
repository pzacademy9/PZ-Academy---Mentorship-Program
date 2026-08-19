import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  href: string;
  counterpartName: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface ConversationThread {
  conversationId: string | null;
  messages: MessageRow[];
  canMessage: boolean;
}

export type SendMessageResult =
  | { ok: true; conversationId: string; message: MessageRow }
  | { ok: false; reason: "no-booking" | "db-error" };

function toMessageRow(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}): MessageRow {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

/**
 * A conversation between a mentor and student may only exist where a
 * booking (any status) already connects them -- mirrors the spec's
 * eligibility rule exactly. mentorId is the mentor's profiles.id
 * (mentor_conversations.mentor_id), so this resolves the mentor's slug
 * first since mentorship_bookings still keys mentors by slug, not id
 * (unchanged from subsystem A/C).
 */
export async function hasBookingBetween(mentorId: string, studentId: string): Promise<boolean> {
  const admin = createAdminSupabase();

  const { data: mentor } = await admin.from("mentors").select("slug").eq("profile_id", mentorId).maybeSingle();
  if (!mentor) return false;

  const { count } = await admin
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("mentor_slug", mentor.slug)
    .eq("student_id", studentId);

  return (count ?? 0) > 0;
}

/** Resolves a mentor's public slug to their messaging identity (linked profiles.id) -- a mentor with no linked account can't be messaged. */
export async function resolveMentorForMessaging(slug: string): Promise<{ profileId: string; name: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select("profile_id, name").eq("slug", slug).maybeSingle();
  if (!data || !data.profile_id) return null;
  return { profileId: data.profile_id, name: data.name };
}

/** Student display name for the mentor-side thread header -- a plain profiles lookup, since a mentor has no other path to a student's name outside an existing session/booking relationship. */
export async function resolveStudentDisplay(studentId: string): Promise<{ name: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("profiles").select("full_name").eq("id", studentId).maybeSingle();
  if (!data) return null;
  return { name: data.full_name || "Student" };
}

/**
 * Lazy conversation creation: the row is upserted here, on first send, not
 * at booking-confirm time (see the spec's "Conversation creation" section
 * for why). Eligibility is re-checked here even though the UI already
 * gates it, since this is the actual security boundary for the mutation.
 */
export async function sendMentorMessage(params: {
  mentorId: string;
  studentId: string;
  senderId: string;
  body: string;
}): Promise<SendMessageResult> {
  const eligible = await hasBookingBetween(params.mentorId, params.studentId);
  if (!eligible) return { ok: false, reason: "no-booking" };

  const admin = createAdminSupabase();

  const { data: conversation, error: upsertError } = await admin
    .from("mentor_conversations")
    .upsert(
      { mentor_id: params.mentorId, student_id: params.studentId },
      { onConflict: "mentor_id,student_id", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (upsertError || !conversation) return { ok: false, reason: "db-error" };

  const { data: message, error: insertError } = await admin
    .from("mentor_messages")
    .insert({ conversation_id: conversation.id, sender_id: params.senderId, body: params.body })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();

  if (insertError || !message) return { ok: false, reason: "db-error" };

  await admin.from("mentor_conversations").update({ last_message_at: message.created_at }).eq("id", conversation.id);

  return { ok: true, conversationId: conversation.id, message: toMessageRow(message) };
}
