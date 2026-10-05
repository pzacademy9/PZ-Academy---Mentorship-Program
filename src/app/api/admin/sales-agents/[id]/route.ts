import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { removeSalesAgent } from "@/lib/data/sales-agents";

/** Removes sales access (role back to student) and releases the agent's contacts. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await removeSalesAgent(id);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "Sales agent not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not remove this sales agent" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, released: result.released });
}
