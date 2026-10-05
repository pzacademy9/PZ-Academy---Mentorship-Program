import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { requestSend } from "@/lib/data/sales-send";
import { sendRequestSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = sendRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await requestSend({
    actor: { id: auth.user.id, role: auth.role },
    contactId: id,
    numberId: parsed.data.numberId,
    messageTemplate: parsed.data.messageTemplate,
    followupInHours: parsed.data.followupInHours,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? "Could not send this message.", reason: result.reason, retryAt: result.retryAt ?? null },
      { status: statusForReason(result.reason) },
    );
  }
  return NextResponse.json({
    link: result.link,
    nextUnlockAt: result.nextUnlockAt,
    warnings: result.warnings,
    isNewChat: result.isNewChat,
    budget: result.budget,
  });
}
