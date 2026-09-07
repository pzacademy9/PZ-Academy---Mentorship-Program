import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getContactDetail } from "@/lib/data/admin-crm-contacts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(detail);
}
