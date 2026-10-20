import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { retryFailed } from "@/lib/data/participant-sends";
import { isUuid } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Send not found" }, { status: 404 });
  try {
    return NextResponse.json({ requeued: await retryFailed(id) });
  } catch (e) {
    console.error("participants retryFailed failed", e);
    return NextResponse.json({ error: "Could not retry" }, { status: 500 });
  }
}
