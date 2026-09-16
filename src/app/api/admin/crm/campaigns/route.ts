import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listCampaigns, createCampaign } from "@/lib/data/admin-crm-campaigns";
import { campaignCreateSchema } from "@/lib/validations/crm";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ campaigns: await listCampaigns() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = campaignCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // A discriminated-union mismatch inside `segment` (e.g. a filter left in
    // an incomplete default state) reports as Zod's generic "Invalid input"
    // with no indication of which field — logging the full issue list is
    // what actually tells you which one.
    console.error("[crm-campaigns] invalid create payload:", JSON.stringify(parsed.error.issues));
    const first = parsed.error.issues[0];
    const where = first?.path.length ? ` (at ${first.path.join(".")})` : "";
    return NextResponse.json({ error: `${first?.message ?? "Invalid input"}${where}` }, { status: 400 });
  }

  const result = await createCampaign(auth.user.id, parsed.data);
  if (!result.ok) return NextResponse.json({ error: "Could not create campaign" }, { status: 500 });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
