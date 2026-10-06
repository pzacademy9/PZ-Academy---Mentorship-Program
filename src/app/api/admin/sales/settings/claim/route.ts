import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getAgentsCanClaim, setAgentsCanClaim } from "@/lib/data/sales-assignment";

const bodySchema = z.object({ value: z.boolean() });

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ value: await getAgentsCanClaim() });
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const result = await setAgentsCanClaim(parsed.data.value);
  if (!result.ok) return NextResponse.json({ error: "Could not save the setting." }, { status: 500 });
  return NextResponse.json({ value: parsed.data.value });
}
