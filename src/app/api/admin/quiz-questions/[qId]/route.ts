import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateQuizQuestion, deleteQuizQuestion } from "@/lib/data/admin-lms";
import { quizQuestionUpdateSchema } from "@/lib/validations/admin-lms";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ qId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { qId } = await params;
  const parsed = quizQuestionUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateQuizQuestion(qId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Question not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not save this question" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ qId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { qId } = await params;
  const result = await deleteQuizQuestion(qId);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Question not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not delete this question" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
