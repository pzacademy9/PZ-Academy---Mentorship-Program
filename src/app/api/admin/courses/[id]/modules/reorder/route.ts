import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reorderModules } from "@/lib/data/admin-lms";
import { reorderSchema } from "@/lib/validations/admin-lms";

/** Takes the complete ordered array of module IDs for this course and rewrites order_index to 0..n-1. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await reorderModules(id, parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not reorder modules" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, warning: result.warning ?? null });
}
