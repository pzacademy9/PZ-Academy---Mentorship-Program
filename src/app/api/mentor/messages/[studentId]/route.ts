import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { sendMessageSchema } from "@/lib/validations/mentor-messaging";
import { sendMentorMessage } from "@/lib/data/mentor-messaging";

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
