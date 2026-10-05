import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { claimContact } from "@/lib/data/sales-contacts";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await claimContact({ id: auth.user.id, role: auth.role }, id);
  if (!result.ok) {
    const error = result.reason === "already-claimed" ? "Someone else already claimed this contact." : "Could not claim this contact.";
    return NextResponse.json({ error, reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true });
}
