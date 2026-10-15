// src/app/api/admin/landing-promo-codes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createPromoCode, listPromoCodes } from "@/lib/data/landing-promo-codes";
import { firstIssue, promoCreateSchema } from "@/lib/validations/landing-promo";

// GET takes no request: without this, Next 14 would prerender it at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ promoCodes: await listPromoCodes() });
  } catch {
    return NextResponse.json({ error: "Could not load the promo codes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = promoCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  const result = await createPromoCode(parsed.data);
  if (!result.ok) {
    if (result.reason === "duplicate") {
      return NextResponse.json({ error: "That code already exists. Choose a different code.", field: "code" }, { status: 409 });
    }
    if (result.reason === "invalid") {
      return NextResponse.json({ error: "Those values are not allowed together. Check the dates and amounts." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save the promo code" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
