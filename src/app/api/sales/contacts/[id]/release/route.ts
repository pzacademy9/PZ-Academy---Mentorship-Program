import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { releaseOwnContact } from "@/lib/data/sales-assignment";
import { statusForReason } from "@/lib/api/sales-http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await releaseOwnContact({ id: auth.user.id, role: auth.role }, id);
  if (!result.ok) {
    const error =
      result.reason === "not-owner"
        ? "You can only hand back your own contacts."
        : result.reason === "not-found"
          ? "Contact not found."
          : "Could not hand this contact back.";
    return NextResponse.json({ error, reason: result.reason }, { status: statusForReason(result.reason) });
  }
  return NextResponse.json({ ok: true });
}
