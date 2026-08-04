import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createLesson } from "@/lib/data/admin-lms";
import { lessonCreateSchema } from "@/lib/validations/admin-lms";

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const parsed = lessonCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createLesson(moduleId, parsed.data.title, parsed.data.contentType);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not create this session" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
