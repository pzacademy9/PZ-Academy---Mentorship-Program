import { NextRequest, NextResponse } from "next/server";
import { recordFunnelEvent } from "@/lib/data/landing-funnel";
import { resolveAgentCode } from "@/lib/data/landing-agent-links";
import { loadPublicPage, NO_STORE, publicJson } from "@/lib/api/landing-public-http";
import { cleanUtm } from "@/lib/landing/registration/utm";
import { eventRequestSchema } from "@/lib/validations/landing-public";

export const dynamic = "force-dynamic";

/**
 * Funnel analytics (view / start / step / submit). The widget sends it with navigator.sendBeacon,
 * whose body arrives as text, so the body is read as text and parsed here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const gate = await loadPublicPage(slug, { registration: false });
  if (!gate.ok) return gate.response;

  let raw: unknown = null;
  try {
    raw = JSON.parse(await req.text());
  } catch {
    raw = null;
  }
  const parsed = eventRequestSchema.safeParse(raw);
  if (!parsed.success) return publicJson({ error: "Invalid input" }, 400);

  const agent = parsed.data.ref ? await resolveAgentCode(parsed.data.ref) : null;
  await recordFunnelEvent({
    pageId: gate.page.id,
    sessionId: parsed.data.sessionId,
    type: parsed.data.type,
    utm: cleanUtm(parsed.data.utm),
    agentId: agent?.agentId ?? null,
  });
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
