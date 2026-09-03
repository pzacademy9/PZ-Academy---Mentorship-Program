import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { addFeaturedItem } from "@/lib/data/admin-marketing";
import { featuredItemCreateSchema } from "@/lib/validations/admin-marketing";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = featuredItemCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await addFeaturedItem(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not feature this item" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}
