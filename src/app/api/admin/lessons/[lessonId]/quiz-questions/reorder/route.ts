import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reorderQuizQuestions } from "@/lib/data/admin-lms";
import { reorderSchema } from "@/lib/validations/admin-lms";

/** Takes the complete ordered array of question IDs for this lesson and rewrites order_index to 0..n-1. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { lessonId } = await params;
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await reorderQuizQuestions(lessonId, parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not reorder questions" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
