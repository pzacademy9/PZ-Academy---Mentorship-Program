import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { appendQuizQuestions, MAX_BULK_QUIZ_QUESTIONS } from "@/lib/data/admin-lms";
import { quizQuestionCreateSchema } from "@/lib/validations/admin-lms";

const bulkSchema = z.object({
  questions: z.array(quizQuestionCreateSchema).min(1).max(MAX_BULK_QUIZ_QUESTIONS),
});

/** Paste-many quiz: appends after the existing questions, never replaces. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { lessonId } = await params;
  const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  if (parsed.data.questions.some((q) => q.correctIndex >= q.options.length)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await appendQuizQuestions(lessonId, parsed.data.questions);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (result.reason === "too-many") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Could not add these questions" }, { status: 500 });
  }
  return NextResponse.json({ created: result.created ?? 0 }, { status: 201 });
}
