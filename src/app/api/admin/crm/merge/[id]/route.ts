import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { resolveMergeCandidate } from "@/lib/data/admin-crm-contacts";
import { mergeResolveSchema } from "@/lib/validations/crm";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = mergeResolveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await resolveMergeCandidate(id, parsed.data.decision, auth.user.id);
  if (!result.ok) {
    const status = result.reason === "not-found" ? 404 : 500;
    return NextResponse.json({ error: "Could not resolve this duplicate" }, { status });
  }

  return NextResponse.json({ ok: true });
}
