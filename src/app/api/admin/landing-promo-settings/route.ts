// src/app/api/admin/landing-promo-settings/route.ts
// The highest percent anyone may type after an owner code (CODE-NN%). One number for the whole site.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getPromoSettings, setPromoSettings } from "@/lib/data/landing-promo-codes";
import { firstIssue, promoSettingsSchema } from "@/lib/validations/landing-promo";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin("landing_pages");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getPromoSettings());
  } catch {
    return NextResponse.json({ error: "Could not load the setting" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin("landing_pages");
  if (!auth.ok) return auth.response;
  const parsed = promoSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ...firstIssue(parsed.error), error: "Enter a whole percentage from 1 to 100." }, { status: 400 });
  }
  try {
    await setPromoSettings(parsed.data.maxPercent);
    return NextResponse.json({ maxPercent: parsed.data.maxPercent });
  } catch {
    return NextResponse.json({ error: "Could not save the setting" }, { status: 500 });
  }
}
