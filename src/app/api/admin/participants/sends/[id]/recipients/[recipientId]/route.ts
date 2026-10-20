import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { markWhatsAppSent } from "@/lib/data/participant-sends";
import { isUuid, markSentBodySchema } from "@/lib/validations/participants";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; recipientId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, recipientId } = await params;
  if (!isUuid(id) || !isUuid(recipientId)) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
  const parsed = markSentBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await markWhatsAppSent(id, recipientId, parsed.data.sent);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message === "Not a WhatsApp send" || message === "Recipient not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("participants markWhatsAppSent failed", e);
    return NextResponse.json({ error: "Could not update the recipient" }, { status: 500 });
  }
}
