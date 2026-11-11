import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { rotateBoardToken } from "@/lib/data/affiliate-leaderboard";

export const dynamic = "force-dynamic";

/** Makes a new public leaderboard link. The old one stops working at once. */
export async function POST() {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  try {
    const token = await rotateBoardToken();
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com").replace(/\/+$/, "");
    return NextResponse.json({ url: `${base}/affiliate-board/${token}` });
  } catch {
    return NextResponse.json({ error: "Could not change the link. Please try again." }, { status: 500 });
  }
}
