import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reorderFeaturedItems } from "@/lib/data/admin-marketing";
import { reorderSchema } from "@/lib/validations/admin-lms";

/** Takes the complete ordered array of featured_item IDs and rewrites order_index to 0..n-1. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await reorderFeaturedItems(parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not reorder featured items" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
