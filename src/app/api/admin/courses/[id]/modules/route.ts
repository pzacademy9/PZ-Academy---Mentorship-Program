import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createModule } from "@/lib/data/admin-lms";
import { moduleCreateSchema } from "@/lib/validations/admin-lms";

/** Creates a module under a course. Rejected for flat types (workshop/webinar/mentorship) — see usesFlatSessions(). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = moduleCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createModule(id, parsed.data.title);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Program not found" }, { status: 404 });
    if (result.reason === "flat-type") {
      return NextResponse.json(
        { error: "This program type stores sessions in a single flat list — modules aren't used." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not create this module" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}
