import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createBanner } from "@/lib/data/admin-marketing";
import { bannerCreateSchema } from "@/lib/validations/admin-marketing";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = bannerCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createBanner(auth.user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not create banner" }, { status: 500 });
  }

  return NextResponse.json({ id: result.id }, { status: 201 });
}
