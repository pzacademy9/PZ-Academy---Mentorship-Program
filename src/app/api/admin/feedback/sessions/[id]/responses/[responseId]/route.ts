import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteFeedbackResponse } from "@/lib/data/feedback-responses";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; responseId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, responseId } = await params;
  try {
    await deleteFeedbackResponse(responseId, id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete response." }, { status: 400 });
  }
}
