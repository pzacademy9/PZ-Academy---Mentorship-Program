import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { reorderBanners } from "@/lib/data/admin-marketing";
import { bannerReorderSchema } from "@/lib/validations/admin-marketing";

/** Takes the complete ordered array of banner IDs for one slot and rewrites order_index to 0..n-1. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = bannerReorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await reorderBanners(parsed.data.slot, parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not reorder banners" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
