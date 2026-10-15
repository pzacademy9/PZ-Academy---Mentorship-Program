// src/lib/data/landing-agent-links.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { slugify } from "@/lib/landing/slug";

const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNIQUE_VIOLATION = "23505";
const MAX_ATTEMPTS = 5;

/** "Ayesha Siddiqui" -> "ayesha". Used as the readable half of a "name-xxx" code. */
export function agentCodeBase(fullName: string): string {
  const first = slugify(fullName).split("-")[0] ?? "";
  return first.slice(0, 12) || "agent";
}

/** Three base-36 characters, e.g. "7k2". `random` is injectable for tests. */
export function randomSuffix(random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 3; i++) s += Math.min(35, Math.floor(random() * 36)).toString(36);
  return s;
}

export function normalizeAgentCode(raw: string): string | null {
  const c = raw.trim().toLowerCase();
  return c.length >= 3 && c.length <= 40 && CODE_RE.test(c) ? c : null;
}

export class AgentLinkError extends Error {
  constructor(public readonly reason: "not-sales-agent" | "db-error") {
    super(reason);
  }
}

/**
 * One short code per sales agent (the page comes from the URL: /e/<slug>?ref=<code>).
 * Idempotent: an agent who already has a code gets it back. Throws AgentLinkError.
 */
export async function getOrCreateAgentLink(agentId: string, random: () => number = Math.random): Promise<{ code: string }> {
  const admin = createAdminSupabase();
  const existing = await admin.from("landing_agent_links").select("code").eq("agent_id", agentId).maybeSingle();
  if (existing.error) throw new AgentLinkError("db-error");
  if (existing.data) return { code: existing.data.code };

  const { data: profile, error: profileError } = await admin.from("profiles").select("full_name, role").eq("id", agentId).maybeSingle();
  if (profileError) throw new AgentLinkError("db-error");
  if (!profile || profile.role !== "sales_agent") throw new AgentLinkError("not-sales-agent");

  const base = agentCodeBase(profile.full_name);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = `${base}-${randomSuffix(random)}`;
    const inserted = await admin.from("landing_agent_links").insert({ agent_id: agentId, code }).select("code").single();
    if (!inserted.error) return { code: inserted.data.code };
    if (inserted.error.code !== UNIQUE_VIOLATION) throw new AgentLinkError("db-error");
    // Either the code collided, or a parallel request just created this agent's link: re-read.
    const again = await admin.from("landing_agent_links").select("code").eq("agent_id", agentId).maybeSingle();
    if (again.data) return { code: again.data.code };
  }
  throw new AgentLinkError("db-error");
}

/**
 * Maps a ?ref= code to the agent, only while that profile is still a sales agent.
 * Never throws: attribution must never block a registration.
 */
export async function resolveAgentCode(code: string): Promise<{ agentId: string } | null> {
  const normalized = normalizeAgentCode(code);
  if (!normalized) return null;
  try {
    const admin = createAdminSupabase();
    const { data: link } = await admin.from("landing_agent_links").select("agent_id").eq("code", normalized).maybeSingle();
    if (!link) return null;
    const { data: profile } = await admin.from("profiles").select("role").eq("id", link.agent_id).maybeSingle();
    return profile?.role === "sales_agent" ? { agentId: link.agent_id } : null;
  } catch {
    return null;
  }
}
