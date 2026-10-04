import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { getTodayQueue } from "@/lib/data/sales-contacts";
import { statusForReason } from "@/lib/api/sales-http";

export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const result = await getTodayQueue({ id: auth.user.id, role: auth.role });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not load today's list.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ items: result.items, remaining: result.remaining });
}
