// src/app/api/admin/landing-pages/[id]/course/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setPageCourse } from "@/lib/data/landing-pages";
import { courseAssignmentSchema, isPageId } from "@/lib/validations/landing";

const MESSAGES = {
  "no-course": "Pick a course first",
  "no-live": "This page has no live option, so it cannot be the main page",
  "course-missing": "Course not found",
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const parsed = courseAssignmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send a course and a main page choice." }, { status: 400 });

  const result = await setPageCourse(id, parsed.data.courseId, parsed.data.isMain);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (result.reason === "error") return NextResponse.json({ error: "Could not save the course. Try again." }, { status: 500 });
    return NextResponse.json({ error: MESSAGES[result.reason] }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
