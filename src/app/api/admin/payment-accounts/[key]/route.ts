import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updatePaymentAccount } from "@/lib/data/landing-payment-accounts";
import { accountPatchSchema } from "@/lib/validations/landing-payment";
import { firstIssue } from "@/lib/validations/landing-promo";

/** Edits or hides an account. Accounts are never deleted. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { key } = await params;

  const parsed = accountPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    const result = await updatePaymentAccount(key, parsed.data);
    if (!result.ok) return NextResponse.json({ error: "That account was not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not save the account. Please try again." }, { status: 500 });
  }
}
