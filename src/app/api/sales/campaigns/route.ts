import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { createCampaign, listMyCampaigns } from "@/lib/data/sales-campaigns";
import { campaignCreateSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";
import { describeDropped, VARIETY_MESSAGE } from "@/lib/crm/campaign-rules";

export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const result = await listMyCampaigns({ id: auth.user.id, role: auth.role });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not load your campaigns." }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ campaigns: result.campaigns });
}

export async function POST(req: Request) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = campaignCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await createCampaign({ id: auth.user.id, role: auth.role }, parsed.data);
  if (!result.ok) {
    const message =
      result.reason === "variety"
        ? VARIETY_MESSAGE
        : result.reason === "number-not-assigned"
          ? "No WhatsApp number is assigned to you yet. Ask your admin."
          : result.reason === "empty-audience"
            ? "None of the selected people can be messaged."
            : result.reason === "too-many"
              ? "Pick 2000 people or fewer."
              : "Could not create this campaign.";
    return NextResponse.json({ error: message, reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json(
    {
      campaignId: result.campaignId,
      recipientCount: result.recipientCount,
      dropped: result.dropped,
      droppedText: describeDropped(result.dropped),
    },
    { status: 201 },
  );
}
