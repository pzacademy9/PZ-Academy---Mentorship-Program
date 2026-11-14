import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getMotivationSendHtml } from "@/lib/data/affiliate-motivation-sends";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The saved example email of one Motivation send, for the history preview. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAdmin("sales_hub");
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  try {
    const html = await getMotivationSendHtml(id);
    if (html === null) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ html });
  } catch {
    return NextResponse.json({ error: "Could not load this email. Please try again." }, { status: 500 });
  }
}
