import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { logOutcome } from "@/lib/data/sales-contacts";
import { outcomeSchema } from "@/lib/validations/sales";
import { statusForReason } from "@/lib/api/sales-http";
import type { OutcomeKind } from "@/lib/crm/followup";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const parsed = outcomeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { id } = await params;
  const result = await logOutcome({ id: auth.user.id, role: auth.role }, id, {
    kind: parsed.data.kind as OutcomeKind,
    askedToStop: parsed.data.askedToStop,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Could not save that.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true, nextFollowupAt: result.nextFollowupAt });
}
