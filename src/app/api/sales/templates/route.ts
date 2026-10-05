import { NextResponse } from "next/server";
import { requireSalesAgent } from "@/lib/auth/require-sales";
import { listTemplates } from "@/lib/data/admin-crm-templates";

/** Shared WhatsApp templates, read-only for agents (plan decision D4). */
export async function GET() {
  const auth = await requireSalesAgent();
  if (!auth.ok) return auth.response;
  try {
    const templates = await listTemplates("whatsapp");
    return NextResponse.json({ templates: templates.map((t) => ({ id: t.id, name: t.name, body: t.body })) });
  } catch {
    return NextResponse.json({ error: "Could not load saved messages." }, { status: 500 });
  }
}
