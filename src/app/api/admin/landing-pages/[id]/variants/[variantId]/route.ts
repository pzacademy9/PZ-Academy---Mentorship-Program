// src/app/api/admin/landing-pages/[id]/variants/[variantId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { deleteVariant, saveVariantDraft, setVariantEnabled } from "@/lib/data/landing-variants";
import { getOwnedVariant } from "@/lib/landing/variant-guard";
import { MAX_VARIANT_BYTES, saveVariantSchema, setEnabledSchema } from "@/lib/validations/landing-variants";

type Ctx = { params: Promise<{ id: string; variantId: string }> };
const notFound = () => NextResponse.json({ error: "Link not found" }, { status: 404 });
const failed = (msg: string) => NextResponse.json({ error: msg }, { status: 500 });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, variantId } = await params;
  const owned = await getOwnedVariant(id, variantId);
  if (!owned.ok) return owned.reason === "not-found" ? notFound() : failed("Could not save changes");

  const text = await req.text().catch(() => "");
  if (new TextEncoder().encode(text).length > MAX_VARIANT_BYTES) {
    return NextResponse.json({ error: "This link has too much content to save." }, { status: 413 });
  }
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* falls through to 400 */ }

  const enabledOnly = setEnabledSchema.safeParse(body);
  if (enabledOnly.success) {
    const r = await setVariantEnabled(variantId, enabledOnly.data.enabled);
    if (!r.ok) return r.reason === "not-found" ? notFound() : failed("Could not save changes");
    return NextResponse.json({ ok: true });
  }

  const parsed = saveVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await saveVariantDraft(variantId, parsed.data.overrides, parsed.data.baseRevision);
  if (!result.ok) {
    if (result.reason === "conflict") {
      return NextResponse.json(
        { error: "Someone else changed this link. Reload to see their changes.", code: "conflict" },
        { status: 409 },
      );
    }
    if (result.reason === "not-found") return notFound();
    return failed("Could not save changes");
  }
  return NextResponse.json({ revision: result.revision });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id, variantId } = await params;
  const owned = await getOwnedVariant(id, variantId);
  if (!owned.ok) return owned.reason === "not-found" ? notFound() : failed("Could not delete");
  const r = await deleteVariant(variantId);
  if (!r.ok) return r.reason === "not-found" ? notFound() : failed("Could not delete");
  return NextResponse.json({ ok: true });
}
