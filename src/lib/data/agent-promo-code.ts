// src/lib/data/agent-promo-code.ts
// A sales agent's own discount code: read it with its numbers, or make it once.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createPromoCode } from "@/lib/data/landing-promo-codes";
import { createAgentPromoWith, type AgentPromoResult } from "@/lib/landing/registration/agent-promo";

export type AgentPromoSummary = { code: string; used: number; paid: number };

async function listOwnerCodes(agentId: string): Promise<{ id: string; code: string }[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_promo_codes")
    .select("id, code")
    .eq("owner_agent_id", agentId)
    .eq("is_owner_code", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, code: r.code }));
}

async function findOwnerCode(agentId: string): Promise<{ id: string; code: string } | null> {
  return (await listOwnerCodes(agentId))[0] ?? null;
}

/** The agent's code with real (non-test) registrations that used it and how many of those are paid. Null when none. */
export async function getAgentPromoSummary(agentId: string): Promise<AgentPromoSummary | null> {
  const found = await findOwnerCode(agentId);
  if (!found) return null;
  const admin = createAdminSupabase();
  const count = async (paidOnly: boolean) => {
    let q = admin
      .from("landing_registrations")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", found.id)
      .eq("is_test", false)
      // Group members carry the lead's code too; one group is one sale, as on the link cards.
      .in("row_type", ["individual", "lead"]);
    if (paidOnly) q = q.eq("status", "paid");
    const { count: n, error } = await q;
    if (error) throw error;
    return n ?? 0;
  };
  const [used, paid] = await Promise.all([count(false), count(true)]);
  return { code: found.code, used, paid };
}

export function createAgentPromo(agentId: string, rawName: string): Promise<AgentPromoResult> {
  return createAgentPromoWith(agentId, rawName, {
    listForAgent: listOwnerCodes,
    create: createPromoCode,
    remove: async (id) => {
      const { error } = await createAdminSupabase().from("landing_promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
  });
}
