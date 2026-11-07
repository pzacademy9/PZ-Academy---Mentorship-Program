import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getTerms, saveTerms } from "@/lib/data/site-terms";
import { siteTermsSchema, termsKeySchema } from "@/lib/validations/site-terms";
import { firstIssue } from "@/lib/validations/landing-promo";

/** Reads ?key=; a missing key means "general", any other unknown key is refused. */
function keyFrom(req: NextRequest) {
  const raw = new URL(req.url).searchParams.get("key");
  return termsKeySchema.safeParse(raw ?? "general");
}

/** One Terms document (admin only). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin("terms");
  if (!auth.ok) return auth.response;
  const key = keyFrom(req);
  if (!key.success) return NextResponse.json({ error: "Unknown document." }, { status: 400 });
  try {
    return NextResponse.json({ body: (await getTerms(key.data)).body });
  } catch {
    return NextResponse.json({ error: "Could not load the Terms. Please try again." }, { status: 500 });
  }
}

/** Saves one Terms document (admin only). */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin("terms");
  if (!auth.ok) return auth.response;
  const key = keyFrom(req);
  if (!key.success) return NextResponse.json({ error: "Unknown document." }, { status: 400 });

  const parsed = siteTermsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    await saveTerms(key.data, parsed.data.body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the Terms. Please try again." }, { status: 500 });
  }
}
