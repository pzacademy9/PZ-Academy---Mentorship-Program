import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setAgentActive } from "@/lib/data/admin-crm-agents";

const patchSchema = z.object({ active: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { id } = await params;
  const ok = await setAgentActive(id, parsed.data.active);
  if (!ok) return NextResponse.json({ error: "Could not update this agent" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
