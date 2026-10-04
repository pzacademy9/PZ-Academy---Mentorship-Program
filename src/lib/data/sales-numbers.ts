import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  DEFAULT_SETTINGS,
  budgetSummary,
  localParts,
  warmupStartAfterFreeze,
  startOfLocalDay,
  type BudgetSummary,
  type NumberState,
  type SafetySettings,
  type Usage,
} from "@/lib/crm/send-limits";

export type NumberRow = {
  id: string;
  label: string;
  phone_e164: string | null;
  status: string;
  frozen_until: string | null;
  warmup_started_on: string;
  daily_cap: number | null;
  hourly_cap: number | null;
  created_at: string;
};

export type AgentBudget = {
  number: { id: string; label: string; phone_e164: string | null };
  budget: BudgetSummary;
};

export function toNumberState(row: NumberRow): NumberState {
  return {
    status: row.status === "frozen" ? "frozen" : "active",
    frozenUntil: row.frozen_until ? new Date(row.frozen_until) : null,
    warmupStartedOn: row.warmup_started_on,
    dailyCapOverride: row.daily_cap,
    hourlyCapOverride: row.hourly_cap,
  };
}

export async function getSafetySettings(): Promise<SafetySettings> {
  const db = createAdminSupabase();
  const { data, error } = await db
    .from("whatsapp_safety_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[sales-numbers] settings read failed, using defaults", error);
    return DEFAULT_SETTINGS;
  }
  return {
    daily_cap: data.daily_cap,
    hourly_cap: data.hourly_cap,
    hourly_warn_at: data.hourly_warn_at,
    spacing_min_s: data.spacing_min_s,
    spacing_max_s: data.spacing_max_s,
    burst_size: data.burst_size,
    burst_break_min: data.burst_break_min,
    quiet_start_hour: data.quiet_start_hour,
    quiet_end_hour: data.quiet_end_hour,
    warmup_start: data.warmup_start,
    warmup_step: data.warmup_step,
    freeze_hours: data.freeze_hours,
    timezone: data.timezone,
  };
}

async function countNewChats(numberId: string, sinceIso: string): Promise<number> {
  const db = createAdminSupabase();
  const { count, error } = await db
    .from("contact_activities")
    .select("id", { count: "exact", head: true })
    .eq("number_id", numberId)
    .eq("kind", "sent")
    .eq("is_new_chat", true)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/** Throws on database errors; callers wrap in try/catch and return db-error. */
export async function getNumberUsage(
  numberId: string,
  now: Date,
  settings: SafetySettings,
): Promise<Usage> {
  const db = createAdminSupabase();
  const dayStart = startOfLocalDay(now, settings.timezone).toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [newChatsToday, newChatsLastHour, lastRes] = await Promise.all([
    countNewChats(numberId, dayStart),
    countNewChats(numberId, hourAgo),
    db
      .from("contact_activities")
      .select("created_at, next_unlock_at, burst_pos")
      .eq("number_id", numberId)
      .eq("kind", "sent")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (lastRes.error) throw lastRes.error;
  const row = lastRes.data?.[0];
  return {
    newChatsToday,
    newChatsLastHour,
    lastSend:
      row && row.next_unlock_at
        ? {
            createdAt: new Date(row.created_at),
            nextUnlockAt: new Date(row.next_unlock_at),
            burstPos: row.burst_pos ?? 1,
          }
        : null,
  };
}

/** The number, if this agent may send from it (admins may use any number). */
export async function getNumberForAgent(
  userId: string,
  isAdmin: boolean,
  numberId: string,
): Promise<NumberRow | null> {
  if (userId === "") return null;
  const db = createAdminSupabase();
  if (!isAdmin) {
    const { data: link } = await db
      .from("whatsapp_number_agents")
      .select("number_id")
      .eq("number_id", numberId)
      .eq("agent_id", userId)
      .maybeSingle();
    if (!link) return null;
  }
  const { data } = await db.from("whatsapp_numbers").select("*").eq("id", numberId).maybeSingle();
  return (data as NumberRow | null) ?? null;
}

async function numbersForAgent(userId: string, isAdmin: boolean): Promise<NumberRow[]> {
  const db = createAdminSupabase();
  if (isAdmin) {
    const { data, error } = await db.from("whatsapp_numbers").select("*").order("label");
    if (error) throw error;
    return (data ?? []) as NumberRow[];
  }
  if (userId === "") return [];
  const { data: links, error: linkErr } = await db
    .from("whatsapp_number_agents")
    .select("number_id")
    .eq("agent_id", userId);
  if (linkErr) throw linkErr;
  const ids = (links ?? []).map((l) => l.number_id);
  if (ids.length === 0) return [];
  const { data, error } = await db.from("whatsapp_numbers").select("*").in("id", ids).order("label");
  if (error) throw error;
  return (data ?? []) as NumberRow[];
}

export async function getBudgetsForAgent(
  userId: string,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<{ ok: true; budgets: AgentBudget[] } | { ok: false; reason: "db-error" }> {
  try {
    const settings = await getSafetySettings();
    const rows = await numbersForAgent(userId, isAdmin);
    const budgets = await Promise.all(
      rows.map(async (row) => ({
        number: { id: row.id, label: row.label, phone_e164: row.phone_e164 },
        budget: budgetSummary({
          now,
          settings,
          state: toNumberState(row),
          usage: await getNumberUsage(row.id, now, settings),
        }),
      })),
    );
    return { ok: true, budgets };
  } catch (e) {
    console.error("[sales-numbers] getBudgetsForAgent", e);
    return { ok: false, reason: "db-error" };
  }
}

export async function logBlockedAttempt(row: {
  numberId: string | null;
  agentId: string | null;
  contactId: string | null;
  reason: string;
}): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db.from("whatsapp_blocked_attempts").insert({
    number_id: row.numberId,
    agent_id: row.agentId,
    contact_id: row.contactId,
    reason: row.reason,
  });
  if (error) console.error("[sales-numbers] could not log blocked attempt", error);
}

/** Panic button: the assigned agent (or an admin) freezes a number for the configured hours. */
export async function freezeNumber(
  userId: string,
  isAdmin: boolean,
  numberId: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; frozenUntil: Date }
  | { ok: false; reason: "not-found" | "number-not-assigned" | "db-error" }
> {
  try {
    const db = createAdminSupabase();
    const { data: exists } = await db.from("whatsapp_numbers").select("id").eq("id", numberId).maybeSingle();
    if (!exists) return { ok: false, reason: "not-found" };
    const row = await getNumberForAgent(userId, isAdmin, numberId);
    if (!row) return { ok: false, reason: "number-not-assigned" };
    const settings = await getSafetySettings();
    const frozenUntil = new Date(now.getTime() + settings.freeze_hours * 3_600_000);
    const { error } = await db
      .from("whatsapp_numbers")
      .update({
        status: "frozen",
        frozen_until: frozenUntil.toISOString(),
        // The number comes back warming up from the day the freeze lapses, not at the full cap.
        warmup_started_on: warmupStartAfterFreeze(frozenUntil, settings.timezone),
      })
      .eq("id", numberId);
    if (error) throw error;
    await logBlockedAttempt({ numberId, agentId: userId, contactId: null, reason: "panic_freeze" });
    return { ok: true, frozenUntil };
  } catch (e) {
    console.error("[sales-numbers] freezeNumber", e);
    return { ok: false, reason: "db-error" };
  }
}

// ---------------------------------------------------------------- admin

export type NumberAdminRow = NumberRow & { agents: { id: string; name: string }[] };

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const db = createAdminSupabase();
  const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
  for (const p of data ?? []) out.set(p.id, p.full_name ?? "");
  return out;
}

export async function listNumbersAdmin(): Promise<
  { ok: true; numbers: NumberAdminRow[] } | { ok: false; reason: "db-error" }
> {
  try {
    const db = createAdminSupabase();
    const [{ data: nums, error: e1 }, { data: links, error: e2 }] = await Promise.all([
      db.from("whatsapp_numbers").select("*").order("label"),
      db.from("whatsapp_number_agents").select("number_id, agent_id"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const names = await profileNames(Array.from(new Set((links ?? []).map((l) => l.agent_id))));
    const numbers = ((nums ?? []) as NumberRow[]).map((n) => ({
      ...n,
      agents: (links ?? [])
        .filter((l) => l.number_id === n.id)
        .map((l) => ({ id: l.agent_id, name: names.get(l.agent_id) ?? "" })),
    }));
    return { ok: true, numbers };
  } catch (e) {
    console.error("[sales-numbers] listNumbersAdmin", e);
    return { ok: false, reason: "db-error" };
  }
}

async function syncAgents(numberId: string, agentIds: string[]): Promise<void> {
  const db = createAdminSupabase();
  const { data: current, error } = await db
    .from("whatsapp_number_agents")
    .select("agent_id")
    .eq("number_id", numberId);
  if (error) throw error;
  const have = new Set((current ?? []).map((r) => r.agent_id));
  const want = new Set(agentIds);
  const toAdd = Array.from(want).filter((id) => !have.has(id));
  const toRemove = Array.from(have).filter((id) => !want.has(id));
  if (toAdd.length > 0) {
    const { error: addErr } = await db
      .from("whatsapp_number_agents")
      .insert(toAdd.map((agent_id) => ({ number_id: numberId, agent_id })));
    if (addErr) throw addErr;
  }
  if (toRemove.length > 0) {
    const { error: rmErr } = await db
      .from("whatsapp_number_agents")
      .delete()
      .eq("number_id", numberId)
      .in("agent_id", toRemove);
    if (rmErr) throw rmErr;
  }
}

export async function createNumber(input: {
  label: string;
  phoneE164?: string;
  dailyCap?: number | null;
  hourlyCap?: number | null;
  agentIds: string[];
}): Promise<{ ok: true; id: string } | { ok: false; reason: "db-error" }> {
  try {
    const db = createAdminSupabase();
    const settings = await getSafetySettings();
    const { data, error } = await db
      .from("whatsapp_numbers")
      .insert({
        label: input.label,
        phone_e164: input.phoneE164 ?? null,
        daily_cap: input.dailyCap ?? null,
        hourly_cap: input.hourlyCap ?? null,
        warmup_started_on: localParts(new Date(), settings.timezone).dateKey,
      })
      .select("id")
      .single();
    if (error) throw error;
    await syncAgents(data.id, input.agentIds);
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[sales-numbers] createNumber", e);
    return { ok: false, reason: "db-error" };
  }
}

export async function updateNumber(
  id: string,
  input: {
    label?: string;
    phoneE164?: string | null;
    dailyCap?: number | null;
    hourlyCap?: number | null;
    agentIds?: string[];
    unfreeze?: true;
  },
): Promise<{ ok: true } | { ok: false; reason: "not-found" | "db-error" }> {
  try {
    const db = createAdminSupabase();
    const { data: existing } = await db.from("whatsapp_numbers").select("id").eq("id", id).maybeSingle();
    if (!existing) return { ok: false, reason: "not-found" };

    const patch: Partial<NumberRow> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.phoneE164 !== undefined) patch.phone_e164 = input.phoneE164;
    if (input.dailyCap !== undefined) patch.daily_cap = input.dailyCap;
    if (input.hourlyCap !== undefined) patch.hourly_cap = input.hourlyCap;
    if (input.unfreeze) {
      // A recovered number restarts its warm-up, per the spec.
      const settings = await getSafetySettings();
      patch.status = "active";
      patch.frozen_until = null;
      patch.warmup_started_on = localParts(new Date(), settings.timezone).dateKey;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("whatsapp_numbers").update(patch).eq("id", id);
      if (error) throw error;
    }
    if (input.agentIds) await syncAgents(id, input.agentIds);
    return { ok: true };
  } catch (e) {
    console.error("[sales-numbers] updateNumber", e);
    return { ok: false, reason: "db-error" };
  }
}

export async function updateSafetySettings(
  patch: Partial<SafetySettings>,
): Promise<{ ok: true; settings: SafetySettings } | { ok: false; reason: "db-error" }> {
  try {
    const db = createAdminSupabase();
    if (Object.keys(patch).length > 0) {
      const { error } = await db
        .from("whatsapp_safety_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    }
    return { ok: true, settings: await getSafetySettings() };
  } catch (e) {
    console.error("[sales-numbers] updateSafetySettings", e);
    return { ok: false, reason: "db-error" };
  }
}

export type BlockedAttemptRow = {
  id: string;
  reason: string;
  created_at: string;
  number_label: string | null;
  agent_name: string | null;
  contact_name: string | null;
};

export async function listBlockedAttempts(
  limit = 100,
): Promise<{ ok: true; rows: BlockedAttemptRow[] } | { ok: false; reason: "db-error" }> {
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("whatsapp_blocked_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = data ?? [];
    const agentNames = await profileNames(Array.from(new Set(rows.map((r) => r.agent_id).filter((x): x is string => !!x))));
    const numberIds = Array.from(new Set(rows.map((r) => r.number_id).filter((x): x is string => !!x)));
    const contactIds = Array.from(new Set(rows.map((r) => r.contact_id).filter((x): x is string => !!x)));
    const [{ data: nums }, { data: cons }] = await Promise.all([
      numberIds.length ? db.from("whatsapp_numbers").select("id, label").in("id", numberIds) : Promise.resolve({ data: [] }),
      contactIds.length ? db.from("contacts").select("id, full_name").in("id", contactIds) : Promise.resolve({ data: [] }),
    ]);
    const numLabel = new Map((nums ?? []).map((n) => [n.id, n.label]));
    const conName = new Map((cons ?? []).map((c) => [c.id, c.full_name]));
    return {
      ok: true,
      rows: rows.map((r) => ({
        id: r.id,
        reason: r.reason,
        created_at: r.created_at,
        number_label: r.number_id ? numLabel.get(r.number_id) ?? null : null,
        agent_name: r.agent_id ? agentNames.get(r.agent_id) ?? null : null,
        contact_name: r.contact_id ? conName.get(r.contact_id) ?? null : null,
      })),
    };
  } catch (e) {
    console.error("[sales-numbers] listBlockedAttempts", e);
    return { ok: false, reason: "db-error" };
  }
}
