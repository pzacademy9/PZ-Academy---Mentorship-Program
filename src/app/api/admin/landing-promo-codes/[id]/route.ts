// src/app/api/admin/landing-promo-codes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getPromoById, updatePromoCode } from "@/lib/data/landing-promo-codes";
import { isPageId } from "@/lib/validations/landing";
import { firstIssue, promoIssues, promoPatchSchema } from "@/lib/validations/landing-promo";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  // isPageId is a plain uuid check: a non-uuid can never be a promo id and would make Postgres error (22P02).
  if (!isPageId(id)) return NextResponse.json({ error: "Promo code not found" }, { status: 404 });

  const parsed = promoPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  // The patch only carries the fields sent, so check the rules against the stored row with the patch merged in.
  const p = parsed.data;
  if (p.type !== undefined || p.value !== undefined || p.fixedAmounts !== undefined || p.startsAt !== undefined || p.endsAt !== undefined) {
    let current;
    try {
      current = await getPromoById(id);
    } catch {
      return NextResponse.json({ error: "Could not save the promo code" }, { status: 500 });
    }
    if (!current) return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    const issue = promoIssues({
      type: p.type ?? current.type,
      value: p.value ?? current.value,
      fixedAmounts: p.fixedAmounts ?? current.fixedAmounts,
      startsAt: p.startsAt !== undefined ? p.startsAt : current.startsAt,
      endsAt: p.endsAt !== undefined ? p.endsAt : current.endsAt,
    })[0];
    if (issue) return NextResponse.json({ error: issue.message, field: issue.path }, { status: 400 });
  }

  const result = await updatePromoCode(id, p);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Promo code not found" }, { status: 404 });
    if (result.reason === "invalid") {
      return NextResponse.json({ error: "Those values are not allowed together. Check the dates and amounts." }, { status: 400 });
    }
    if (result.reason === "duplicate") {
      return NextResponse.json({ error: "That code already exists. Choose a different code.", field: "code" }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not save the promo code" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id });
}
