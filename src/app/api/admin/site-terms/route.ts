import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getGeneralTerms, saveGeneralTerms } from "@/lib/data/site-terms";
import { siteTermsSchema } from "@/lib/validations/site-terms";
import { firstIssue } from "@/lib/validations/landing-promo";

/** The general Terms and Conditions text (admin only). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ body: await getGeneralTerms() });
  } catch {
    return NextResponse.json({ error: "Could not load the Terms. Please try again." }, { status: 500 });
  }
}

/** Saves the general Terms and Conditions text (admin only). */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = siteTermsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    await saveGeneralTerms(parsed.data.body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the Terms. Please try again." }, { status: 500 });
  }
}
