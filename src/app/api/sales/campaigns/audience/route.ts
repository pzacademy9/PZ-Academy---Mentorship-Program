import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { loadCampaignAudience } from "@/lib/data/sales-campaigns";
import { statusForReason } from "@/lib/api/sales-http";

export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const result = await loadCampaignAudience({ id: auth.user.id, role: auth.role });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not load your contacts." }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ rows: result.rows, truncated: result.truncated });
}
