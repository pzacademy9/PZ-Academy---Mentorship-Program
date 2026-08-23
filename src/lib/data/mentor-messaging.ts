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

/** Resolves a mentor's public slug to their messaging identity (linked profiles.id) -- a mentor with no linked account can't be messaged. photoUrl is the mentor's curated public-profile photo (mentors.photo_url), not profiles.avatar_url. */
export async function resolveMentorForMessaging(
  slug: string,
): Promise<{ profileId: string; name: string; photoUrl: string | null } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select("profile_id, name, photo_url").eq("slug", slug).maybeSingle();
  if (!data || !data.profile_id) return null;
  return { profileId: data.profile_id, name: data.name, photoUrl: data.photo_url };
}

/** Student display name + avatar for the mentor-side thread header -- a plain profiles lookup, since a mentor has no other path to a student's identity outside an existing session/booking relationship. */
export async function resolveStudentDisplay(
  studentId: string,
): Promise<{ name: string; avatarUrl: string | null } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("profiles").select("full_name, avatar_url").eq("id", studentId).maybeSingle();
  if (!data) return null;
  return { name: data.full_name || "Student", avatarUrl: data.avatar_url };
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
  // Defense in depth: every current caller derives senderId from the
  // authenticated session and it always equals mentorId or studentId, but
  // this function is the actual security boundary for the mutation, so it
  // shouldn't rely on caller discipline alone.
  if (params.senderId !== params.mentorId && params.senderId !== params.studentId) {
    return { ok: false, reason: "no-booking" };
  }

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

/** Mentor's own inbox -- conversations where mentor_id is the caller. */
export async function listConversationsForMentor(mentorId: string): Promise<ConversationSummary[]> {
  const admin = createAdminSupabase();

  const { data: conversations } = await admin
    .from("mentor_conversations")
    .select("id, student_id, last_message_at, mentor_last_read_at, profiles!mentor_conversations_student_id_fkey(full_name)")
    .eq("mentor_id", mentorId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!conversations || conversations.length === 0) return [];

  const previews = await latestMessagePreviewsByConversation(conversations.map((c) => c.id));

  return conversations.map((c) => ({
    id: c.id,
    href: `/dashboard/mentor/messages/${c.student_id}`,
    counterpartName: (c.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
    lastMessageAt: c.last_message_at,
    lastMessagePreview: previews.get(c.id) ?? null,
    unread: c.last_message_at != null && (c.mentor_last_read_at == null || c.last_message_at > c.mentor_last_read_at),
  }));
}

/** Student's own inbox -- conversations where student_id is the caller. Each row also resolves the mentor's public slug for routing, since mentorship pages are keyed by slug everywhere else in the app. */
export async function listConversationsForStudent(studentId: string): Promise<ConversationSummary[]> {
  const admin = createAdminSupabase();

  const { data: conversations } = await admin
    .from("mentor_conversations")
    .select("id, mentor_id, last_message_at, student_last_read_at")
    .eq("student_id", studentId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (!conversations || conversations.length === 0) return [];

  const mentorIds = Array.from(new Set(conversations.map((c) => c.mentor_id)));
  const { data: mentorRows } = await admin.from("mentors").select("profile_id, slug, name").in("profile_id", mentorIds);
  const mentorByProfileId = new Map((mentorRows ?? []).map((m) => [m.profile_id as string, m]));

  const previews = await latestMessagePreviewsByConversation(conversations.map((c) => c.id));

  return conversations.map((c) => {
    const mentor = mentorByProfileId.get(c.mentor_id);
    return {
      id: c.id,
      href: `/dashboard/messages/${mentor?.slug ?? ""}`,
      counterpartName: mentor?.name ?? "Mentor",
      lastMessageAt: c.last_message_at,
      lastMessagePreview: previews.get(c.id) ?? null,
      unread: c.last_message_at != null && (c.student_last_read_at == null || c.last_message_at > c.student_last_read_at),
    };
  });
}

/** Most recent message body per conversation, for inbox row previews -- one bounded query plus a JS reduction, mirroring listUpcomingSessionsForMentor's join style rather than an N+1 query per row. Capped at 500 rows across the whole batch: a generous recency budget for finding each conversation's true latest message without an unbounded scan of the viewer's entire message history. */
async function latestMessagePreviewsByConversation(conversationIds: string[]): Promise<Map<string, string>> {
  if (conversationIds.length === 0) return new Map();
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mentor_messages")
    .select("conversation_id, body, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(500);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (!map.has(row.conversation_id)) map.set(row.conversation_id, row.body);
  }
  return map;
}

/** A single thread's full message history plus whether messaging is even allowed -- conversationId is null when nobody has sent a message yet (lazy creation), which is a normal, expected state, not an error. */
export async function getConversationForMentor(mentorId: string, studentId: string): Promise<ConversationThread> {
  return getConversationThread({ mentorId, studentId });
}

export async function getConversationForStudent(studentId: string, mentorId: string): Promise<ConversationThread> {
  return getConversationThread({ mentorId, studentId });
}

async function getConversationThread(params: { mentorId: string; studentId: string }): Promise<ConversationThread> {
  const admin = createAdminSupabase();

  const [{ data: conversation }, canMessage] = await Promise.all([
    admin
      .from("mentor_conversations")
      .select("id")
      .eq("mentor_id", params.mentorId)
      .eq("student_id", params.studentId)
      .maybeSingle(),
    hasBookingBetween(params.mentorId, params.studentId),
  ]);

  if (!conversation) return { conversationId: null, messages: [], canMessage };

  // Newest 200 first (bounded), then reversed for ascending display order --
  // an unbounded thread history is a real scalability risk this review
  // caught; 200 is enough for any realistic mentorship conversation, and a
  // longer one shows its most recent 200 rather than getting stuck loading
  // its oldest 200 forever. Real pagination is out of scope for now.
  const { data: messages } = await admin
    .from("mentor_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return { conversationId: conversation.id, messages: (messages ?? []).map(toMessageRow).reverse(), canMessage };
}

/** Bumps the viewer's own read-marker -- service-role, called from the thread page itself right after loading, not from a client action. */
export async function markConversationRead(conversationId: string, viewerRole: "mentor" | "student"): Promise<void> {
  const admin = createAdminSupabase();
  const timestamp = new Date().toISOString();
  const updateData = viewerRole === "mentor" ? { mentor_last_read_at: timestamp } : { student_last_read_at: timestamp };
  await admin.from("mentor_conversations").update(updateData).eq("id", conversationId);
}
