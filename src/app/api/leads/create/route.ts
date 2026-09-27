import { NextRequest, NextResponse } from "next/server";
import { leadCreateSchema } from "@/lib/validations/leads";
import {
  getAgentByToken,
  countRecentLeadsByAgent,
  findLeadByPhone,
  insertLead,
  updateLeadFields,
} from "@/lib/data/leads";

const RATE_LIMIT_PER_HOUR = 30;

export async function POST(req: NextRequest) {
  const parsed = leadCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  const agent = await getAgentByToken(input.token);
  if (!agent) {
    return NextResponse.json({ error: "Invalid or inactive agent link" }, { status: 403 });
  }

  // Rate limit: the leads table itself is the store, same reasoning as
  // /api/mentorship/bookings — no shared in-memory state across serverless
  // invocations, and no existing Redis/Upstash dependency to add one for.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentCount = await countRecentLeadsByAgent(agent.id, oneHourAgo);
  if (recentCount >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many leads submitted recently. Please wait a bit and try again." },
      { status: 429 },
    );
  }

  const fields = {
    name: input.name ?? null,
    email: input.email ?? null,
    phone: input.phone,
    profession: input.profession ?? null,
    leadCampaignId: input.leadCampaignId ?? null,
    agentId: agent.id,
  };

  // Two-phase protocol: no resolution yet means "check before writing." A
  // duplicate phone is returned to the client to decide, rather than
  // silently creating a second row for the same person. See the plan's
  // "Deviation from spec — route count" note.
  if (!input.resolution) {
    const existing = await findLeadByPhone(input.phone);
    if (existing) {
      return NextResponse.json({ duplicate: true, existingLead: existing });
    }
    const id = await insertLead(fields);
    return NextResponse.json({ ok: true, id });
  }

  if (input.resolution === "update") {
    await updateLeadFields(input.existingLeadId!, fields);
    return NextResponse.json({ ok: true, id: input.existingLeadId });
  }

  const id = await insertLead(fields);
  return NextResponse.json({ ok: true, id });
}
