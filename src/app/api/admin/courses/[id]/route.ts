import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateCourseConfig, deleteCourse } from "@/lib/data/admin-lms";
import { courseConfigSchema } from "@/lib/validations/admin-lms";

/** Saves the Configuration form (Basics + Mentor Profile). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = courseConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateCourseConfig(id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    if (result.reason === "type-switch-blocked") {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warning: result.warning });
}

/** Guarded delete — blocked outright if the program has any enrollment row. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteCourse(id);

  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    if (result.reason === "has-enrollments") {
      return NextResponse.json(
        {
          error: `This program has ${result.enrollmentCount} enrollment${result.enrollmentCount === 1 ? "" : "s"} on record and can't be deleted. Unpublish it instead.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not delete this program" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, warning: result.warning });
}
