import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendTestEmail } from "@/lib/data/admin-crm-campaigns";
import { campaignTestSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = campaignTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const result = await sendTestEmail(id, parsed.data.email);
  if (!result.ok) return NextResponse.json({ error: "Could not send the test email" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
