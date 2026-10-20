import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSend } from "@/lib/data/participant-sends";
import { isUuid } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Send not found" }, { status: 404 });
  try {
    const found = await getSend(id);
    if (!found) return NextResponse.json({ error: "Send not found" }, { status: 404 });
    return NextResponse.json(found);
  } catch (e) {
    console.error("participants getSend failed", e);
    return NextResponse.json({ error: "Could not load the send" }, { status: 500 });
  }
}
