import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { createAgentPromo } from "@/lib/data/agent-promo-code";

const bodySchema = z.object({ name: z.string().max(60) });

/** A sales agent makes their own discount code, once. The owner is always the signed-in user. */
export async function POST(req: Request) {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  // Admins pass the sales gate, but only a sales agent has a personal code.
  if (auth.role !== "sales_agent") return NextResponse.json({ error: "Only sales agents have a discount code." }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type a name for your code." }, { status: 400 });

  const r = await createAgentPromo(auth.user.id, parsed.data.name);
  if (r.ok) return NextResponse.json({ ok: true, code: r.code }, { status: 201 });
  if (r.reason === "invalid") return NextResponse.json({ error: r.error }, { status: 400 });
  if (r.reason === "exists") return NextResponse.json({ error: "You already have a code." }, { status: 409 });
  if (r.reason === "taken") return NextResponse.json({ error: "That code is already taken. Try another." }, { status: 409 });
  return NextResponse.json({ error: "Could not save your code. Please try again." }, { status: 500 });
}
