import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listAffiliates } from "@/lib/data/affiliates";
import type { AffiliateStatus } from "@/lib/affiliates/service";

const STATUSES: readonly AffiliateStatus[] = ["applied", "accepted", "dropped", "left"];

/** Applications and affiliates, newest first. The private token is never in this list. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const raw = new URL(req.url).searchParams.get("status");
  const status = STATUSES.find((s) => s === raw);
  try {
    return NextResponse.json({ affiliates: await listAffiliates(status ? { status } : {}) });
  } catch {
    return NextResponse.json({ error: "Could not load affiliates. Please try again." }, { status: 500 });
  }
}
