import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteManualConversion } from "@/lib/data/admin-crm-manual-conversions";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteManualConversion(id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: result.reason === "not-found" ? "Not found" : "Could not delete this record." }, { status });
  }

  return NextResponse.json({ ok: true });
}
