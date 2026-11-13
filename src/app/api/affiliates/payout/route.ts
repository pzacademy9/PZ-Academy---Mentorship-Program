// src/app/api/affiliates/payout/route.ts
// An affiliate asks to be paid. The secret link token is the only key. The amount is always the whole available
// balance, worked out here on the server: a number from the browser is never read.
import { NextResponse } from "next/server";
import { z } from "zod";
import { affiliatePageCallerAllowed } from "@/lib/pzid/caller-allowed";
import { getAffiliatePageModel } from "@/lib/data/affiliate-page";
import { requestPayout } from "@/lib/data/affiliate-payouts";
import { canRequest, validatePayoutDetails } from "@/lib/affiliates/payouts";

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  method: z.string().max(40),
  title: z.string().max(200),
  number: z.string().max(80),
});

export async function POST(req: Request) {
  if (!(await affiliatePageCallerAllowed())) {
    return NextResponse.json({ error: "Too many tries. Please wait a few minutes and try again." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const body = parsed.data;

  // A wrong token, a dropped affiliate and one who left all get the same answer as the closed page.
  let model;
  try {
    model = await getAffiliatePageModel(body.token);
  } catch (e) {
    console.error("[affiliate-payout] could not read the affiliate:", e);
    return NextResponse.json({ error: "Could not send your request. Please try again." }, { status: 500 });
  }
  if (!model) return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });

  const details = validatePayoutDetails(body);
  if (!details.ok) return NextResponse.json({ error: details.error }, { status: 400 });

  if (!canRequest(model.balancePkr)) {
    return NextResponse.json({ error: "Your balance has not reached the minimum yet." }, { status: 409 });
  }

  const result = await requestPayout({
    affiliateId: model.affiliateId,
    available: model.balancePkr,
    method: details.method,
    title: details.title,
    number: details.number,
  });
  if (!result.ok) {
    if (result.reason === "already-pending") {
      return NextResponse.json({ error: "You already have a request waiting." }, { status: 409 });
    }
    if (result.reason === "below-minimum") {
      return NextResponse.json({ error: "Your balance has not reached the minimum yet." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not send your request. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, amountPkr: result.amountPkr });
}
