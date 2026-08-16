import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await generateFeedbackShareToken("session", id, auth.user.id);
  return NextResponse.json(result);
}
