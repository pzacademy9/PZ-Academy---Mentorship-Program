import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { sendMessageSchema, messageActionSchema } from "@/lib/validations/mentor-messaging";
import {
  sendMentorMessage,
  resolveMentorForMessaging,
  resolveConversationId,
  hideMessageForViewer,
  deleteMessageForEveryone,
  clearConversation,
} from "@/lib/data/mentor-messaging";

/**
 * Public route, login-only (no role gate) -- same inline auth.getUser()
 * pattern as /api/sessions/book/route.ts, since no requireStudent()
 * helper exists in this repo and the real security boundary is
 * sendMentorMessage's own booking-eligibility check, not this route.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ mentorSlug: string }> }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { mentorSlug } = await params;
  const mentor = await resolveMentorForMessaging(mentorSlug);
  if (!mentor) {
    return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
  }

  const parsed = sendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await sendMentorMessage({
    mentorId: mentor.profileId,
    studentId: user.id,
    senderId: user.id,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "no-booking" ? "You need a booking with this mentor first" : "Could not send message" },
      { status: result.reason === "no-booking" ? 403 : 500 },
    );
  }

  return NextResponse.json({ ok: true, conversationId: result.conversationId, message: result.message });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ mentorSlug: string }> }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { mentorSlug } = await params;
  const mentor = await resolveMentorForMessaging(mentorSlug);
  if (!mentor) {
    return NextResponse.json({ error: "Mentor not found" }, { status: 404 });
  }

  const parsed = messageActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const conversationId = await resolveConversationId(mentor.profileId, user.id);
  if (!conversationId) {
    return NextResponse.json({ error: "No conversation found" }, { status: 404 });
  }

  const input = parsed.data;
  const ok =
    input.action === "hide"
      ? await hideMessageForViewer({ conversationId, messageId: input.messageId, viewerId: user.id })
      : input.action === "delete"
        ? await deleteMessageForEveryone({ conversationId, messageId: input.messageId, senderId: user.id })
        : await clearConversation(conversationId, user.id);

  if (!ok) {
    return NextResponse.json({ error: "Could not complete that action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
