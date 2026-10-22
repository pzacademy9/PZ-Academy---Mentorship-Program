import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setCountryAccounts } from "@/lib/data/landing-payment-countries";
import { countryAccountsSchema } from "@/lib/validations/landing-payment";
import { firstIssue } from "@/lib/validations/landing-promo";

/** Replaces a country's ordered account list (at least one account). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ regionKey: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { regionKey } = await params;

  const parsed = countryAccountsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    const result = await setCountryAccounts(regionKey, parsed.data.accountKeys);
    if (!result.ok) {
      if (result.reason === "not_ready") {
        return NextResponse.json({ error: "Country lists are not switched on yet. Please try again later." }, { status: 503 });
      }
      return NextResponse.json({ error: "That country or one of its accounts was not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the list. Please try again." }, { status: 500 });
  }
}
