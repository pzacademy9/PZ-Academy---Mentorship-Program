import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createPaymentAccount } from "@/lib/data/landing-payment-accounts";
import { accountCreateSchema } from "@/lib/validations/landing-payment";
import { firstIssue } from "@/lib/validations/landing-promo";

/** Adds a payment account to the library (admin only). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = accountCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    const result = await createPaymentAccount(parsed.data);
    if (!result.ok) return NextResponse.json({ error: "Give the account a name with letters or numbers in it.", field: "label" }, { status: 400 });
    return NextResponse.json({ key: result.key }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save the account. Please try again." }, { status: 500 });
  }
}
