// src/app/api/admin/landing-promo-codes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updatePromoCode } from "@/lib/data/landing-promo-codes";
import { isPageId } from "@/lib/validations/landing";
import { firstIssue, promoPatchSchema } from "@/lib/validations/landing-promo";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  // isPageId is a plain uuid check: a non-uuid can never be a promo id and would make Postgres error (22P02).
  if (!isPageId(id)) return NextResponse.json({ error: "Promo code not found" }, { status: 404 });

  const parsed = promoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  const result = await updatePromoCode(id, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    if (result.reason === "duplicate") {
      return NextResponse.json({ error: "That code already exists. Choose a different code.", field: "code" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save the promo code" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id });
}
