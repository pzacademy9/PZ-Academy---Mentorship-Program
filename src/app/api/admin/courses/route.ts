import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createCourse } from "@/lib/data/admin-lms";
import { courseCreateSchema } from "@/lib/validations/admin-lms";

/** Creates a draft program (title + type only). Everything else is filled in on the Configuration page. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = courseCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createCourse(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not create this program" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, slug: result.slug }, { status: 201 });
}
