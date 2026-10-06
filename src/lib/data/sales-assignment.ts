import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/crm/ownership";
import { nextFollowupFor } from "@/lib/crm/followup";
import { planAssignment, chunk, type AssignCandidate } from "@/lib/crm/assignment";

const ID_CHUNK = 200;

export type AssignSource = { kind: "cohort"; batchId: string } | { kind: "contacts"; contactIds: string[] };
export type AssignPreview = {
  counts: {
    toAssign: number;
    alreadyYours: number;
    skippedOwned: number;
    skippedDnc: number;
    reassigning: number;
    total: number;
  };
  agentName: string;
};
export type AssignResult = { assigned: number; reassigned: number };

type Fail<R extends string> = { ok: false; reason: R };
const dbError = (tag: string, e: unknown): Fail<"db-error"> => {
  console.error(`[sales-assignment] ${tag}`, e);
  return { ok: false, reason: "db-error" };
};

async function loadCandidates(source: AssignSource): Promise<AssignCandidate[] | null> {
  const db = createAdminSupabase();
  let ids: string[];
  if (source.kind === "contacts") {
    ids = Array.from(new Set(source.contactIds));
  } else {
    const found = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("contact_purchases")
        .select("contact_id")
        .eq("import_batch_id", source.batchId)
        .range(from, from + 999);
      if (error) throw error;
      for (const row of data ?? []) found.add(row.contact_id);
      if ((data ?? []).length < 1000) break;
    }
    ids = Array.from(found);
    if (ids.length === 0) return null;
  }
  const out: AssignCandidate[] = [];
  for (const slice of chunk(ids, ID_CHUNK)) {
    const { data, error } = await db.from("contacts").select("id, owner_id, do_not_contact_at").in("id", slice);
    if (error) throw error;
    for (const c of data ?? []) out.push({ id: c.id, ownerId: c.owner_id, doNotContact: c.do_not_contact_at !== null });
  }
  return out;
}

async function loadAgent(agentId: string) {
  const db = createAdminSupabase();
  const { data, error } = await db.from("profiles").select("id, role, full_name").eq("id", agentId).maybeSingle();
  if (error) throw error;
  return data && data.role === "sales_agent" ? data : null;
}

/** Admin only: dry-run of a bulk assignment, so the UI can show what would happen. */
export async function previewAssignment(
  admin: Actor,
  source: AssignSource,
  agentId: string,
  includeOwned: boolean,
): Promise<{ ok: true; preview: AssignPreview } | Fail<"not-allowed" | "invalid-agent" | "not-found" | "db-error">> {
  if (admin.role !== "admin" && admin.role !== "super_admin") return { ok: false, reason: "not-allowed" };
  try {
    const agent = await loadAgent(agentId);
    if (!agent) return { ok: false, reason: "invalid-agent" };
    const candidates = await loadCandidates(source);
    if (!candidates || candidates.length === 0) return { ok: false, reason: "not-found" };
    const plan = planAssignment(candidates, agentId, includeOwned);
    return {
      ok: true,
      preview: {
        counts: {
          toAssign: plan.toAssign.length,
          alreadyYours: plan.alreadyYours.length,
          skippedOwned: plan.skippedOwned.length,
          skippedDnc: plan.skippedDnc.length,
          reassigning: plan.reassigning.length,
          total: candidates.length,
        },
        agentName: agent.full_name ?? "",
      },
    };
  } catch (e) {
    return dbError("previewAssignment", e);
  }
}

/** Admin only: assign the planned contacts to one sales agent, with a timeline event each and one notification. */
export async function commitAssignment(
  admin: Actor,
  source: AssignSource,
  agentId: string,
  includeOwned: boolean,
  now: Date = new Date(),
): Promise<{ ok: true; result: AssignResult } | Fail<"not-allowed" | "invalid-agent" | "not-found" | "db-error">> {
  if (admin.role !== "admin" && admin.role !== "super_admin") return { ok: false, reason: "not-allowed" };
  try {
    const agent = await loadAgent(agentId);
    if (!agent) return { ok: false, reason: "invalid-agent" };
    const candidates = await loadCandidates(source);
    if (!candidates || candidates.length === 0) return { ok: false, reason: "not-found" };
    const plan = planAssignment(candidates, agentId, includeOwned);
    const reassigning = new Set(plan.reassigning);

    const db = createAdminSupabase();
    const iso = now.toISOString();
    const followup = nextFollowupFor("claimed", now)!.toISOString();
    let assigned = 0;
    let reassigned = 0;
    for (const slice of chunk(plan.toAssign, ID_CHUNK)) {
      let q = db
        .from("contacts")
        .update({ owner_id: agentId, claimed_at: iso, next_followup_at: followup })
        .in("id", slice)
        .is("do_not_contact_at", null); // never assign do-not-contact, even if flagged since load
      if (!includeOwned) q = q.is("owner_id", null); // guards against a concurrent claim
      const { data: updated, error } = await q.select("id");
      if (error) throw error;
      const done = updated ?? [];
      if (done.length === 0) continue;
      assigned += done.length;
      reassigned += done.filter((c) => reassigning.has(c.id)).length;
      const { error: actErr } = await db.from("contact_activities").insert(
        done.map((c) => ({
          contact_id: c.id,
          agent_id: admin.id,
          kind: reassigning.has(c.id) ? "reassigned" : "claimed",
          body: `Assigned to ${agent.full_name ?? "agent"}`,
          created_at: iso,
        })),
      );
      if (actErr) throw actErr;
    }

    if (assigned > 0) {
      try {
        const { error: nErr } = await db.from("notifications").insert({
          user_id: agentId,
          type: "contacts_assigned",
          title: "New contacts assigned",
          body: `${assigned} contacts were assigned to you.`,
          link: "/dashboard/sales/contacts",
        });
        if (nErr) throw nErr;
      } catch (e) {
        console.error("[sales-assignment] notify failed", e);
      }
    }
    return { ok: true, result: { assigned, reassigned } };
  } catch (e) {
    return dbError("commitAssignment", e);
  }
}

export async function listAgentAssignmentCounts(): Promise<{ agentId: string; fullName: string; contactCount: number }[]> {
  const db = createAdminSupabase();
  const { data, error } = await db.from("profiles").select("id, full_name").eq("role", "sales_agent");
  if (error) throw error;
  return Promise.all(
    (data ?? []).map(async (p) => {
      const { count, error: cErr } = await db
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", p.id);
      if (cErr) throw cErr;
      return { agentId: p.id, fullName: p.full_name ?? "", contactCount: count ?? 0 };
    }),
  );
}

/** Admin switch for agents claiming unassigned contacts. Fails closed: any error or missing row is off. */
export async function getAgentsCanClaim(): Promise<boolean> {
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("whatsapp_safety_settings")
      .select("agents_can_claim")
      .eq("id", true)
      .maybeSingle();
    if (error || !data) return false;
    return data.agents_can_claim === true;
  } catch {
    return false;
  }
}

export async function setAgentsCanClaim(value: boolean): Promise<{ ok: true } | { ok: false }> {
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("whatsapp_safety_settings")
      .update({ agents_can_claim: value, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("id");
    // Zero rows updated (missing singleton row) must not read as success.
    return error || !data || data.length === 0 ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}
