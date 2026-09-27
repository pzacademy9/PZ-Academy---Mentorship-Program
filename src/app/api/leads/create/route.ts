import { NextRequest, NextResponse } from "next/server";
import { leadCreateSchema } from "@/lib/validations/leads";
import {
  getAgentByToken,
  countRecentLeadsByAgent,
  findLeadByPhone,
  getLeadById,
  insertLead,
  updateLeadFields,
  type LeadUpdateFields,
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
    const existingLead = await getLeadById(input.existingLeadId!);
    if (!existingLead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    // Unlike insert, an update must not blank out fields the agent's chat
    // paste simply didn't mention this time — only include a key here when
    // the input actually provided it. Phone and agentId always update:
    // phone is always required/validated, and agentId should always move to
    // whoever last touched the lead.
    const updateFields: LeadUpdateFields = {
      phone: input.phone,
      agentId: agent.id,
      ...(input.name !== undefined && input.name !== null ? { name: input.name } : {}),
      ...(input.email !== undefined && input.email !== null ? { email: input.email } : {}),
      ...(input.profession !== undefined && input.profession !== null ? { profession: input.profession } : {}),
      ...(input.leadCampaignId !== undefined && input.leadCampaignId !== null
        ? { leadCampaignId: input.leadCampaignId }
        : {}),
    };
    await updateLeadFields(input.existingLeadId!, updateFields);
    return NextResponse.json({ ok: true, id: input.existingLeadId });
  }

  const id = await insertLead(fields);
  return NextResponse.json({ ok: true, id });
}
