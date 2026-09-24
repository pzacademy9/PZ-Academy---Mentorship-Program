import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteTemplate } from "@/lib/data/admin-crm-templates";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteTemplate(id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Could not delete this template." }, { status });
  }

  return NextResponse.json({ ok: true });
}
