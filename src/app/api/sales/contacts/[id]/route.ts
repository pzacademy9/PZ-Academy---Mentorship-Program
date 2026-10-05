import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { getContactDetail } from "@/lib/data/sales-contacts";
import { statusForReason } from "@/lib/api/sales-http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await getContactDetail({ id: auth.user.id, role: auth.role }, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not open this contact.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({
    contact: result.contact,
    timeline: result.timeline,
    canAct: result.canAct,
    restricted: result.restricted,
  });
}
