import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { listAgents, createAgent } from "@/lib/data/admin-crm-agents";
import { agentCreateSchema } from "@/lib/validations/crm";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ agents: await listAgents() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = agentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await createAgent(parsed.data.name);
  if (!result.ok) return NextResponse.json({ error: "Could not create agent" }, { status: 500 });

  return NextResponse.json({ agent: result.agent }, { status: 201 });
}
