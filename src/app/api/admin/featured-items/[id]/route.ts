import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { removeFeaturedItem } from "@/lib/data/admin-marketing";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await removeFeaturedItem(id);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Featured item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not remove featured item" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
