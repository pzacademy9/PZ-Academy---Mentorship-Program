import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listWhatsAppBatches, createWhatsAppBatch } from "@/lib/data/admin-crm-whatsapp";
import { whatsappBatchCreateSchema } from "@/lib/validations/crm";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ batches: await listWhatsAppBatches() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = whatsappBatchCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await createWhatsAppBatch(auth.user.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "empty-audience") {
      return NextResponse.json({ error: "No phone-reachable contacts match this segment." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create this batch." }, { status: 500 });
  }

  return NextResponse.json({ batchId: result.batchId, recipientCount: result.recipientCount }, { status: 201 });
}
