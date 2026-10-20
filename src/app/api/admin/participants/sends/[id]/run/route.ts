import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { runEmailSend } from "@/lib/data/participant-sends";
import { isUuid } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Send not found" }, { status: 404 });
  try {
    return NextResponse.json(await runEmailSend(id));
  } catch (e) {
    console.error("participants runEmailSend failed", e);
    return NextResponse.json({ error: "Could not run the send" }, { status: 500 });
  }
}
