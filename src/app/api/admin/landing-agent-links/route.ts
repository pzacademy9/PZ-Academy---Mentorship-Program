// src/app/api/admin/landing-agent-links/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AgentLinkError, getOrCreateAgentLink } from "@/lib/data/landing-agent-links";
import { agentLinkSchema, firstIssue } from "@/lib/validations/landing-promo";

/**
 * The agent's personal ref code (one per sales agent, created on first use). The share link is
 * /e/<slug>?ref=<code> for any page. Admin only in Phase 2; the agents' own "My links" panel is Phase 3.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = agentLinkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(firstIssue(parsed.error), { status: 400 });

  try {
    const { code } = await getOrCreateAgentLink(parsed.data.agentId);
    return NextResponse.json({ code });
  } catch (err) {
    if (err instanceof AgentLinkError && err.reason === "not-sales-agent") {
      return NextResponse.json({ error: "Links can only be made for sales agents.", field: "agentId" }, { status: 422 });
    }
    return NextResponse.json({ error: "Could not create the link" }, { status: 500 });
  }
}
