import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { decidePayout, type PayoutRow } from "@/lib/data/affiliate-payouts";
import { getAffiliateDetail } from "@/lib/data/affiliates";
import { affiliateLink, affiliateSupportWa } from "@/lib/affiliates/contact";
import { sendPayoutPaid, sendPayoutRejected } from "@/lib/affiliates/send";

type Ctx = { params: Promise<{ id: string }> };

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paid") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(300) }),
]);

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** Sends the decision email. Never throws: a failed email must not undo the decision. */
async function notify(row: PayoutRow, input: z.infer<typeof body>): Promise<boolean> {
  try {
    const a = await getAffiliateDetail(row.affiliateId);
    if (!a) return false;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
    const pageUrl = a.token ? affiliateLink(a.token) : base;
    const who = { id: a.id, name: a.name, email: a.email };
    if (input.action === "paid") {
      const paidOn = new Date(row.decidedAt ?? Date.now()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      return await sendPayoutPaid(who, { name: a.name, amountPkr: row.amountPkr, method: row.method, paidOn, pageUrl, supportWa: affiliateSupportWa() });
    }
    return await sendPayoutRejected(who, { name: a.name, amountPkr: row.amountPkr, reason: input.reason, pageUrl, supportWa: affiliateSupportWa() });
  } catch (e) {
    console.error("[affiliate-payouts] could not send the decision email:", e);
    return false;
  }
}

/** Mark one pending payout paid, or reject it with a reason. A decision cannot be applied twice. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("That request was not understood. A reason of 3 to 300 characters is needed to reject.", 400);
  const input = parsed.data;

  const r = await decidePayout(id, input.action === "paid" ? { action: "paid" } : { action: "reject", reason: input.reason });
  if (!r.ok) {
    if (r.reason === "not-found") return fail("Not found.", 404);
    if (r.reason === "not-pending") return fail("This payout was already decided.", 409);
    return fail("Could not save. Please try again.", 500);
  }
  const emailSent = await notify(r.row, input);
  return NextResponse.json({ ok: true, emailSent });
}
