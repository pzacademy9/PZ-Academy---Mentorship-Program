// src/app/api/admin/landing-pages/[id]/variants/[variantId]/rollback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { rollbackVariant } from "@/lib/data/landing-variants";
import { getOwnedVariant } from "@/lib/landing/variant-guard";
import { rollbackVariantSchema } from "@/lib/validations/landing-variants";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, variantId } = await params;
  const owned = await getOwnedVariant(id, variantId);
  if (!owned.ok) {
    return owned.reason === "not-found"
      ? NextResponse.json({ error: "Link not found" }, { status: 404 })
      : NextResponse.json({ error: "Could not restore that version" }, { status: 500 });
  }

  const parsed = rollbackVariantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await rollbackVariant(auth.user.id, variantId, parsed.data.version);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Version not found" }, { status: 404 });
    if (result.reason === "conflict") {
      return NextResponse.json({ error: "Someone else changed this link. Reload and try again.", code: "conflict" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not restore that version" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, version: result.version });
}
