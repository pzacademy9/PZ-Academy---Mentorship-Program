import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { clearAffiliateEmails } from "@/lib/data/affiliate-emails";

const idSchema = z.string().uuid();
const daysSchema = z.coerce.number().int().min(0).max(3650);

/** Clears email history: one affiliate (?affiliateId=) or everything older than N days (?olderThanDays=, 0 = all). Naming neither is refused. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const q = new URL(req.url).searchParams;
  const rawId = q.get("affiliateId");
  const rawDays = q.get("olderThanDays");

  let scope: { affiliateId: string } | { olderThanDays: number };
  if (rawId !== null) {
    const id = idSchema.safeParse(rawId);
    if (!id.success) return NextResponse.json({ error: "That affiliate was not understood." }, { status: 400 });
    scope = { affiliateId: id.data };
  } else if (rawDays !== null) {
    const days = daysSchema.safeParse(rawDays);
    if (!days.success) return NextResponse.json({ error: "Days must be a whole number, 0 or more." }, { status: 400 });
    scope = { olderThanDays: days.data };
  } else {
    return NextResponse.json({ error: "Say which history to clear." }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, removed: await clearAffiliateEmails(scope) });
  } catch {
    return NextResponse.json({ error: "Could not clear the history. Please try again." }, { status: 500 });
  }
}
