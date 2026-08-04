import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reorderLessons } from "@/lib/data/admin-lms";
import { reorderSchema } from "@/lib/validations/admin-lms";

/** Takes the complete ordered array of lesson IDs for this module and rewrites order_index to 0..n-1. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { moduleId } = await params;
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await reorderLessons(moduleId, parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not reorder sessions" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
