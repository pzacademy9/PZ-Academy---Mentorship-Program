import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createPaymentCountry } from "@/lib/data/landing-payment-countries";
import { countryCreateSchema } from "@/lib/validations/landing-payment";
import { firstIssue } from "@/lib/validations/landing-promo";

/** Adds a country to the payment accounts screen (admin only). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = countryCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    const result = await createPaymentCountry(parsed.data);
    if (!result.ok) {
      if (result.reason === "exists") return NextResponse.json({ error: "That country code is already in the list.", field: "regionKey" }, { status: 409 });
      return NextResponse.json({ error: "Check the country code and name." }, { status: 400 });
    }
    return NextResponse.json({ regionKey: parsed.data.regionKey }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save the country. Please try again." }, { status: 500 });
  }
}
