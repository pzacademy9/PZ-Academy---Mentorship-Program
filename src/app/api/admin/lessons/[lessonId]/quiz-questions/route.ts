import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createQuizQuestion } from "@/lib/data/admin-lms";
import { quizQuestionCreateSchema } from "@/lib/validations/admin-lms";

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { lessonId } = await params;
  const parsed = quizQuestionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createQuizQuestion(lessonId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not create this question" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
