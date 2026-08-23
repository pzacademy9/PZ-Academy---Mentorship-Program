import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { sendMessageSchema, messageActionSchema } from "@/lib/validations/mentor-messaging";
import {
  sendMentorMessage,
  resolveConversationId,
  hideMessageForViewer,
  deleteMessageForEveryone,
  clearConversation,
} from "@/lib/data/mentor-messaging";

export async function POST(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { studentId } = await params;
  const parsed = sendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await sendMentorMessage({
    mentorId: auth.user.id,
    studentId,
    senderId: auth.user.id,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "no-booking" ? "No booking exists with this student yet" : "Could not send message" },
      { status: result.reason === "no-booking" ? 403 : 500 },
    );
  }

  return NextResponse.json({ ok: true, conversationId: result.conversationId, message: result.message });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { studentId } = await params;
  const parsed = messageActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const conversationId = await resolveConversationId(auth.user.id, studentId);
  if (!conversationId) {
    return NextResponse.json({ error: "No conversation found" }, { status: 404 });
  }

  const input = parsed.data;
  const ok =
    input.action === "hide"
      ? await hideMessageForViewer({ conversationId, messageId: input.messageId, viewerId: auth.user.id })
      : input.action === "delete"
        ? await deleteMessageForEveryone({ conversationId, messageId: input.messageId, senderId: auth.user.id })
        : await clearConversation(conversationId, auth.user.id);

  if (!ok) {
    return NextResponse.json({ error: "Could not complete that action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
