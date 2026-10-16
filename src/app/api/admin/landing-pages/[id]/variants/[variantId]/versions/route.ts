// src/app/api/admin/landing-pages/[id]/variants/[variantId]/versions/route.ts
// A country / module link's published versions, newest first (the editor's Version History on a link).
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listVariantVersions } from "@/lib/data/landing-variants";
import { getOwnedVariant } from "@/lib/landing/variant-guard";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, variantId } = await params;
  const owned = await getOwnedVariant(id, variantId);
  if (!owned.ok) {
    return owned.reason === "not-found"
      ? NextResponse.json({ error: "Link not found" }, { status: 404 })
      : NextResponse.json({ error: "Could not load versions" }, { status: 500 });
  }
  try {
    return NextResponse.json({ versions: await listVariantVersions(variantId) });
  } catch {
    return NextResponse.json({ error: "Could not load versions" }, { status: 500 });
  }
}
