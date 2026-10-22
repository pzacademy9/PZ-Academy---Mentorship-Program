import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updatePaymentCountry } from "@/lib/data/landing-payment-countries";
import { countryPatchSchema } from "@/lib/validations/landing-payment";
import { firstIssue } from "@/lib/validations/landing-promo";

/** Renames or hides a country. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ regionKey: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { regionKey } = await params;

  const parsed = countryPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    const result = await updatePaymentCountry(regionKey, parsed.data);
    if (!result.ok) return NextResponse.json({ error: "That country was not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the country. Please try again." }, { status: 500 });
  }
}
