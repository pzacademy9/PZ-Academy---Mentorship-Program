import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteImportBatch } from "@/lib/data/admin-crm-import";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteImportBatch(id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Could not delete this cohort" }, { status });
  }

  return NextResponse.json({ ok: true });
}
