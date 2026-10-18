// src/app/api/admin/landing-whatsapp/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteWhatsappNumber } from "@/lib/data/landing-whatsapp";
import { isPageId } from "@/lib/validations/landing";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Number not found" }, { status: 404 });

  const result = await deleteWhatsappNumber(id);
  if (!result.ok) return NextResponse.json({ error: "Could not remove the number" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
