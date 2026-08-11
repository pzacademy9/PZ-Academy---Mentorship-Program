import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reorderMentors } from "@/lib/data/admin-mentors";
import { reorderSchema } from "@/lib/validations/admin-lms";

/** Takes the complete ordered array of mentor IDs and rewrites order_index to 0..n-1. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await reorderMentors(parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not reorder mentors" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
