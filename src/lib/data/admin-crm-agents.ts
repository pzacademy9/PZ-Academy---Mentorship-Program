import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listLeadsByAgent, type AgentLeadRow } from "./leads";

/**
 * Sales agent link management for the admin CRM panel. Agents themselves are
 * from 0058_lead_capture.sql — this is just the admin-facing CRUD on top of
 * that table, replacing the go-live guide's manual SQL insert.
 */

export type Agent = {
  id: string;
  name: string;
  token: string;
  active: boolean;
  createdAt: string;
};

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function listAgents(): Promise<Agent[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agents")
    .select("id, name, token, active, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    token: row.token,
    active: row.active,
    createdAt: row.created_at,
  }));
}

export async function createAgent(name: string): Promise<{ ok: true; agent: Agent } | { ok: false }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("agents")
    .insert({ name, token: randomToken() })
    .select("id, name, token, active, created_at")
    .single();
  if (error || !data) return { ok: false };
  return {
    ok: true,
    agent: { id: data.id, name: data.name, token: data.token, active: data.active, createdAt: data.created_at },
  };
}

export async function setAgentActive(id: string, active: boolean): Promise<boolean> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("agents").update({ active }).eq("id", id);
  return !error;
}

export type AgentDetail = Agent & { leads: AgentLeadRow[] };

export async function getAgentDetail(id: string): Promise<AgentDetail | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("agents")
    .select("id, name, token, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  const leads = await listLeadsByAgent(id);
  return { id: data.id, name: data.name, token: data.token, active: data.active, createdAt: data.created_at, leads };
}
