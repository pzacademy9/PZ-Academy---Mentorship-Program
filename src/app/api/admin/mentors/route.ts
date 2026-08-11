import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createMentor } from "@/lib/data/admin-mentors";
import { mentorCreateSchema } from "@/lib/validations/admin-mentor";

/** Creates a draft mentor (name only). Everything else is filled in on the Configuration page. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = mentorCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createMentor(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not create this mentor" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, slug: result.slug }, { status: 201 });
}
