import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type Agent = { id: string; name: string; active: boolean };

export async function getAgentByToken(token: string): Promise<Agent | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agents")
    .select("id, name, active")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data;
}

export type LeadCampaign = { id: string; name: string };

export async function listActiveLeadCampaigns(): Promise<LeadCampaign[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("lead_campaigns")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });
  return data ?? [];
}

export type ExistingLead = { id: string; status: string; leadCampaignName: string | null };

export async function findLeadByPhone(phone: string): Promise<ExistingLead | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("leads")
    .select("id, status, lead_campaigns(name)")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    leadCampaignName: (data.lead_campaigns as { name: string } | null)?.name ?? null,
  };
}

export async function countRecentLeadsByAgent(agentId: string, sinceIso: string): Promise<number> {
  const admin = createAdminSupabase();
  const { count } = await admin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gte("created_at", sinceIso);
  return count ?? 0;
}

export type LeadFields = {
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  leadCampaignId: string | null;
  agentId: string;
};

export async function insertLead(fields: LeadFields): Promise<string> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("leads")
    .insert({
      name: fields.name,
      email: fields.email,
      phone: fields.phone,
      profession: fields.profession,
      lead_campaign_id: fields.leadCampaignId,
      agent_id: fields.agentId,
      status: "new",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return data.id;
}

export type LeadUpdateFields = {
  name?: string | null;
  email?: string | null;
  phone?: string;
  profession?: string | null;
  leadCampaignId?: string | null;
  agentId?: string;
};

export async function updateLeadFields(leadId: string, fields: LeadUpdateFields): Promise<void> {
  const admin = createAdminSupabase();
  const updates: {
    name?: string | null;
    email?: string | null;
    phone?: string;
    profession?: string | null;
    lead_campaign_id?: string | null;
    agent_id?: string;
  } = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.email !== undefined) updates.email = fields.email;
  if (fields.phone !== undefined) updates.phone = fields.phone;
  if (fields.profession !== undefined) updates.profession = fields.profession;
  if (fields.leadCampaignId !== undefined) updates.lead_campaign_id = fields.leadCampaignId;
  if (fields.agentId !== undefined) updates.agent_id = fields.agentId;

  const { error } = await admin.from("leads").update(updates).eq("id", leadId);
  if (error) throw new Error(error.message);
}

export async function getLeadById(leadId: string): Promise<{ id: string; updatedAt: string } | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("leads").select("id, updated_at").eq("id", leadId).maybeSingle();
  if (!data) return null;
  return { id: data.id, updatedAt: data.updated_at };
}

export async function applyStatusAndNotesFromSheet(
  leadId: string,
  status: string,
  notes: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("leads").update({ status, notes }).eq("id", leadId);
  if (error) throw new Error(error.message);
}

export type LeadSyncRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  profession: string | null;
  campaignName: string | null;
  agentName: string | null;
  status: string;
  notes: string | null;
};

/**
 * Full row for pushing to the Sheet — resolves lead_campaign_id/agent_id
 * into readable names rather than trusting the inbound webhook payload's
 * own copy of those fields (a webhook retry could carry a stale record).
 */
export async function getLeadSyncRow(leadId: string): Promise<LeadSyncRow | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("leads")
    .select("id, name, email, phone, profession, status, notes, lead_campaigns(name), agents(name)")
    .eq("id", leadId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    profession: data.profession,
    campaignName: (data.lead_campaigns as { name: string } | null)?.name ?? null,
    agentName: (data.agents as { name: string } | null)?.name ?? null,
    status: data.status,
    notes: data.notes,
  };
}
