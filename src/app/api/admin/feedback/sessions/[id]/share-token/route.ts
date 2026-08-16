import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const result = await generateFeedbackShareToken("session", id, auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not generate share link.";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
