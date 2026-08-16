import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteFeedbackProgram } from "@/lib/data/feedback-programs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await deleteFeedbackProgram(id, auth.user.id);
  return NextResponse.json({ ok: true });
}
