import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCampaignConversionDetail } from "@/lib/data/admin-crm-campaigns";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const detail = await getCampaignConversionDetail(id);
  if (!detail) return NextResponse.json({ error: "Not tracked" }, { status: 404 });

  return NextResponse.json(detail);
}
