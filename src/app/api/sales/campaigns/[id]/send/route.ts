import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { sendCampaignRecipient } from "@/lib/data/sales-campaigns";
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
  const result = await sendCampaignRecipient({ id: auth.user.id, role: auth.role }, id, parsed.data.recipientId);
  if (!result.ok) {
    const r = result as {
      reason: string;
      message?: string;
      retryAt?: string | null;
      paused?: boolean;
      recipientBlocked?: boolean;
      pendingCount?: number;
    };
    // recipientBlocked stays non-2xx too: the client reads the body to skip past that person.
    return NextResponse.json(
      {
        error: r.message ?? "Could not send this message.",
        reason: r.reason,
        retryAt: r.retryAt ?? null,
        paused: r.paused ?? false,
        recipientBlocked: r.recipientBlocked ?? false,
        pendingCount: r.pendingCount ?? null,
      },
      { status: statusForReason(r.reason) },
    );
  }
  return NextResponse.json({
    link: result.link,
    nextUnlockAt: result.nextUnlockAt,
    warnings: result.warnings,
    budget: result.budget,
    sentCount: result.sentCount,
    pendingCount: result.pendingCount,
    done: result.done,
  });
}
