import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateRecipientStatus } from "@/lib/data/admin-crm-whatsapp";
import { whatsappRecipientStatusSchema } from "@/lib/validations/crm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recipientId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id, recipientId } = await params;
  const parsed = whatsappRecipientStatusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await updateRecipientStatus(id, recipientId, parsed.data.status, auth.user.id);
  if (!result.ok) {
    if (result.reason === "agent-campaign") {
      return NextResponse.json({ error: "This campaign belongs to a sales agent. You can watch its progress but not change it." }, { status: 409 });
    }
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Could not update this recipient." }, { status });
  }

  return NextResponse.json({ ok: true });
}
