// src/app/api/admin/landing-pages/[id]/variants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getLandingPage } from "@/lib/data/landing-pages";
import { ensureVariant, listVariants } from "@/lib/data/landing-variants";
import { buildVariantGrid } from "@/lib/landing/variant-grid";
import { isPageId } from "@/lib/validations/landing";
import { createVariantSchema } from "@/lib/validations/landing-variants";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  try {
    const page = await getLandingPage(id);
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const variants = await listVariants(id);
    return NextResponse.json({ variants, grid: buildVariantGrid(page.draft, variants) });
  } catch {
    return NextResponse.json({ error: "Could not load links" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const parsed = createVariantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { regionKey, moduleKey, enabled } = parsed.data;
  const result = await ensureVariant(id, { regionKey, moduleKey }, enabled);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    if (result.reason === "bad-ref") return NextResponse.json({ error: "That link does not exist on this page" }, { status: 400 });
    return NextResponse.json({ error: "Could not create the link" }, { status: 500 });
  }
  return NextResponse.json({ variant: result.variant });
}
