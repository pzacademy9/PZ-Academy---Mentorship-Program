import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { freezeNumber } from "@/lib/data/sales-numbers";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const isAdmin = auth.role === "admin" || auth.role === "super_admin";
  const result = await freezeNumber(auth.user.id, isAdmin, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not pause this number.", reason: result.reason }, { status: statusForReason(result.reason) });
  }
  if (!result.changed) return NextResponse.json({ ok: true, changed: false, frozenUntil: null, alreadyFrozen: "indefinitely" });
  return NextResponse.json({ ok: true, changed: true, frozenUntil: result.frozenUntil.toISOString() });
}
