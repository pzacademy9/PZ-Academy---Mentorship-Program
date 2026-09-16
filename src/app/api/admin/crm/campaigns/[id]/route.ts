import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getCampaign, updateCampaign, deleteCampaign } from "@/lib/data/admin-crm-campaigns";
import { campaignUpdateSchema } from "@/lib/validations/crm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(campaign);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = campaignUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    console.error("[crm-campaigns] invalid update payload:", JSON.stringify(parsed.error.issues));
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` (at ${first.path.join(".")})` : "";
    return NextResponse.json({ error: `${first?.message ?? "Invalid input"}${where}` }, { status: 400 });
  }

  const result = await updateCampaign(id, parsed.data);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : result.reason === "already-sent" ? 409 : 500;
    const error = result.reason === "already-sent" ? "Only a draft can be edited." : "Could not update the campaign.";
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ id: result.id });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteCampaign(id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : result.reason === "already-sent" ? 409 : 500;
    const error = result.reason === "already-sent" ? "Only a draft can be deleted." : "Could not delete the campaign.";
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ ok: true });
}
