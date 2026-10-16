// src/app/api/admin/landing-pages/[id]/variants/[variantId]/publish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { publishVariant } from "@/lib/data/landing-variants";
import { getOwnedVariant } from "@/lib/landing/variant-guard";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; variantId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, variantId } = await params;
  const owned = await getOwnedVariant(id, variantId);
  if (!owned.ok) {
    return owned.reason === "not-found"
      ? NextResponse.json({ error: "Link not found" }, { status: 404 })
      : NextResponse.json({ error: "Could not publish" }, { status: 500 });
  }

  const result = await publishVariant(auth.user.id, variantId);
  if (!result.ok) {
    if (result.reason === "not-ready") {
      return NextResponse.json({ error: "This link is not ready to publish yet.", problems: result.problems }, { status: 422 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Link not found" }, { status: 404 });
    if (result.reason === "main-not-published") {
      return NextResponse.json({ error: "Publish the main page first.", code: "main-not-published" }, { status: 409 });
    }
    if (result.reason === "conflict") {
      return NextResponse.json(
        { error: "This link changed while it was being published. Check your latest edits and publish again.", code: "conflict" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not publish" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, version: result.version });
}
