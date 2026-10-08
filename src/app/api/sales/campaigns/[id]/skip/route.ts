import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { skipCampaignRecipient } from "@/lib/data/sales-campaigns";
import { campaignRecipientSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = campaignRecipientSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await skipCampaignRecipient({ id: auth.user.id, role: auth.role }, id, parsed.data.recipientId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "not-found" ? "Campaign not found." : "Could not skip this person.", reason: result.reason },
      { status: statusForReason(result.reason) },
    );
  }
  return NextResponse.json({ pendingCount: result.pendingCount, done: result.done });
}
