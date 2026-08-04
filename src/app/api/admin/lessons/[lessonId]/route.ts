import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateLesson, deleteLesson, getLessonDetail } from "@/lib/data/admin-lms";
import { lessonUpdateSchema } from "@/lib/validations/admin-lms";

/** Full lesson detail (body, quiz questions) — fetched lazily when a lesson is selected in the Builder, not part of the initial page load. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { lessonId } = await params;
  const detail = await getLessonDetail(lessonId);
  if (!detail) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/** The Lesson Editor's autosave target (Part D) — also used by Part C's title/type edits. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { lessonId } = await params;
  const parsed = lessonUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateLesson(lessonId, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Session not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not save this session" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}

const deleteBodySchema = z.object({ confirm: z.boolean().default(false) });

/** Guarded delete — see deleteLesson in src/lib/data/admin-lms.ts for the same rules as module deletion. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { lessonId } = await params;
  const { confirm } = deleteBodySchema.parse(await req.json().catch(() => ({})));

  const result = await deleteLesson(lessonId, confirm);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (result.reason === "needs-confirmation") {
      return NextResponse.json(
        {
          error: `This session has ${result.recordCount} student progress/quiz record(s). Confirm to delete anyway.`,
          needsConfirmation: true,
          recordCount: result.recordCount,
        },
        { status: 409 },
      );
    }
    if (result.reason === "blocked-published-active") {
      return NextResponse.json(
        {
          error: `This program is published with active enrollments and has ${result.recordCount} student record(s) under this session. Unpublish it before deleting.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not delete this session" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
