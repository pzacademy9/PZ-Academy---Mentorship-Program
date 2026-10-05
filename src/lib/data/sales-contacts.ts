import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { canActOnContact, canClaimContact, canSeeDetails, type Actor } from "@/lib/crm/ownership";
import {
  coldQueueFilter,
  isWarmOutcome,
  nextFollowupFor,
  rankQueue,
  WARM_OUTCOMES,
  type OutcomeKind,
} from "@/lib/crm/followup";
import { normalizePhone } from "@/lib/crm/phone";
import { contactSearchFilter } from "@/lib/validations/sales";

const PAGE_SIZE = 30;
const QUEUE_LIMIT = 50;
const DAY_MS = 86_400_000;
/** PostgREST returns at most 1000 rows; activity reads below are capped at it explicitly. */
const ACTIVITY_READ_LIMIT = 1000;

export type QueueCard = {
  id: string;
  full_name: string;
  phone_e164: string;
  last_outcome: string | null;
  next_followup_at: string | null;
  last_note: string | null;
  warm: boolean;
  recently_contacted: boolean;
};

export type ContactRow = {
  id: string;
  full_name: string;
  phone_e164: string | null;
  owner_id: string | null;
  owner_name: string | null;
  last_outcome: string | null;
  next_followup_at: string | null;
  do_not_contact_at: string | null;
};

export type TimelineEntry = {
  id: string;
  kind: string;
  body: string | null;
  agent_name: string | null;
  created_at: string;
};

const canUseSales = (a: Actor) => a.role === "sales_agent" || a.role === "admin" || a.role === "super_admin";
const isAdminRole = (a: Actor) => a.role === "admin" || a.role === "super_admin";

type Fail<R extends string> = { ok: false; reason: R };
const dbError = (tag: string, e: unknown): Fail<"db-error"> => {
  console.error(`[sales-contacts] ${tag}`, e);
  return { ok: false, reason: "db-error" };
};

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await createAdminSupabase().from("profiles").select("id, full_name").in("id", ids);
  for (const p of data ?? []) out.set(p.id, p.full_name ?? "");
  return out;
}

export async function getTodayQueue(
  actor: Actor,
  now: Date = new Date(),
): Promise<{ ok: true; items: QueueCard[]; remaining: number } | Fail<"db-error" | "not-allowed">> {
  if (!canUseSales(actor)) return { ok: false, reason: "not-allowed" };
  if (actor.id === "") return { ok: true, items: [], remaining: 0 };
  try {
    const db = createAdminSupabase();
    const nowIso = now.toISOString();
    const owned = () =>
      db
        .from("contacts")
        .select("id, full_name, phone_e164, last_outcome, next_followup_at", { count: "exact" })
        .eq("owner_id", actor.id)
        .is("do_not_contact_at", null)
        .is("whatsapp_unsubscribed_at", null)
        .not("phone_e164", "is", null);

    // Warm first (spec 5.8). The limit applies to each half separately, so a long cold
    // backlog can never push people who already replied out of the list.
    const [warmRes, coldRes] = await Promise.all([
      owned()
        .in("last_outcome", [...WARM_OUTCOMES])
        .lte("next_followup_at", nowIso)
        .order("next_followup_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(QUEUE_LIMIT),
      owned()
        .or(coldQueueFilter(nowIso))
        .order("next_followup_at", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true })
        .limit(QUEUE_LIMIT),
    ]);
    if (warmRes.error) throw warmRes.error;
    if (coldRes.error) throw coldRes.error;
    const remaining = (warmRes.count ?? 0) + (coldRes.count ?? 0);

    const ranked = rankQueue(
      [...(warmRes.data ?? []), ...(coldRes.data ?? [])].map((r) => ({ ...r, warm: isWarmOutcome(r.last_outcome) })),
      now,
    ).slice(0, QUEUE_LIMIT);
    if (ranked.length === 0) return { ok: true, items: [], remaining };
    const ids = ranked.map((r) => r.id);

    const [recentRes, noteRes] = await Promise.all([
      db
        .from("contact_activities")
        .select("contact_id")
        .in("contact_id", ids)
        .eq("kind", "sent")
        .gte("created_at", new Date(now.getTime() - DAY_MS).toISOString())
        .limit(ACTIVITY_READ_LIMIT),
      db
        .from("contact_activities")
        .select("contact_id, body")
        .in("contact_id", ids)
        .eq("kind", "note")
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_READ_LIMIT),
    ]);
    for (const r of [recentRes, noteRes]) if (r.error) throw r.error;
    const recent = new Set((recentRes.data ?? []).map((r) => r.contact_id));
    const lastNote = new Map<string, string>();
    for (const n of noteRes.data ?? []) {
      if (!lastNote.has(n.contact_id) && n.body) lastNote.set(n.contact_id, n.body);
    }

    return {
      ok: true,
      remaining,
      items: ranked.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        phone_e164: r.phone_e164 as string,
        last_outcome: r.last_outcome,
        next_followup_at: r.next_followup_at,
        last_note: lastNote.get(r.id) ?? null,
        warm: r.warm,
        recently_contacted: recent.has(r.id),
      })),
    };
  } catch (e) {
    return dbError("getTodayQueue", e);
  }
}

export async function listContacts(
  actor: Actor,
  query: { tab: "mine" | "unclaimed" | "all"; q?: string; page: number },
): Promise<{ ok: true; rows: ContactRow[]; total: number; pageSize: number } | Fail<"db-error" | "not-allowed">> {
  if (!canUseSales(actor)) return { ok: false, reason: "not-allowed" };
  try {
    const db = createAdminSupabase();
    let q = db
      .from("contacts")
      .select("id, full_name, phone_e164, owner_id, last_outcome, next_followup_at, do_not_contact_at", {
        count: "exact",
      });
    if (query.tab === "mine") q = actor.id === "" ? q.eq("id", "00000000-0000-0000-0000-000000000000") : q.eq("owner_id", actor.id);
    if (query.tab === "unclaimed") q = q.is("owner_id", null);
    const filter = query.q
      ? contactSearchFilter(query.q, { id: actor.id, isAdmin: isAdminRole(actor), tab: query.tab })
      : null;
    if (filter) q = q.or(filter);
    const from = (query.page - 1) * PAGE_SIZE;
    const { data, count, error } = await q
      .order("updated_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    const names = await ownerNames(Array.from(new Set(rows.map((r) => r.owner_id).filter((x): x is string => !!x))));
    return {
      ok: true,
      rows: rows.map((r) => {
        const visible = canSeeDetails({ viewerId: actor.id, viewerRole: actor.role, ownerId: r.owner_id });
        return {
          ...r,
          // Others' contacts: mask the phone, follow-up time and do-not-contact status for non-admin viewers.
          phone_e164: visible ? r.phone_e164 : null,
          next_followup_at: visible ? r.next_followup_at : null,
          do_not_contact_at: visible ? r.do_not_contact_at : null,
          owner_name: r.owner_id ? names.get(r.owner_id) ?? null : null,
        };
      }),
      total: count ?? 0,
      pageSize: PAGE_SIZE,
    };
  } catch (e) {
    return dbError("listContacts", e);
  }
}

export async function getContactDetail(actor: Actor, contactId: string): Promise<
  | {
      ok: true;
      contact: ContactRow & { email: string | null; profession: string | null };
      timeline: TimelineEntry[];
      canAct: boolean;
      /** True when the viewer may only see name, owner and status (another agent's contact). */
      restricted: boolean;
    }
  | Fail<"not-found" | "not-allowed" | "db-error">
> {
  if (actor.role !== "sales_agent" && actor.role !== "admin" && actor.role !== "super_admin") {
    return { ok: false, reason: "not-allowed" };
  }
  try {
    const db = createAdminSupabase();
    const { data: c, error } = await db
      .from("contacts")
      .select("id, full_name, phone_e164, email, profession, owner_id, last_outcome, next_followup_at, do_not_contact_at")
      .eq("id", contactId)
      .maybeSingle();
    if (error) throw error;
    if (!c) return { ok: false, reason: "not-found" };
    if (!canSeeDetails({ viewerId: actor.id, viewerRole: actor.role, ownerId: c.owner_id })) {
      const ownerMap = await ownerNames(c.owner_id ? [c.owner_id] : []);
      return {
        ok: true,
        contact: {
          id: c.id,
          full_name: c.full_name,
          phone_e164: null,
          email: null,
          profession: null,
          owner_id: c.owner_id,
          owner_name: c.owner_id ? ownerMap.get(c.owner_id) ?? null : null,
          last_outcome: c.last_outcome,
          next_followup_at: null,
          do_not_contact_at: null,
        },
        timeline: [],
        canAct: false,
        restricted: true,
      };
    }
    const { data: acts, error: actErr } = await db
      .from("contact_activities")
      .select("id, kind, body, agent_id, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (actErr) throw actErr;
    const names = await ownerNames([
      ...Array.from(new Set([c.owner_id, ...(acts ?? []).map((a) => a.agent_id)].filter((x): x is string => !!x))),
    ]);
    return {
      ok: true,
      contact: { ...c, owner_name: c.owner_id ? names.get(c.owner_id) ?? null : null },
      timeline: (acts ?? []).map((a) => ({
        id: a.id,
        kind: a.kind,
        body: a.body,
        agent_name: a.agent_id ? names.get(a.agent_id) ?? null : null,
        created_at: a.created_at,
      })),
      canAct: canActOnContact({ owner_id: c.owner_id }, actor).ok,
      restricted: false,
    };
  } catch (e) {
    return dbError("getContactDetail", e);
  }
}

export async function claimContact(
  actor: Actor,
  contactId: string,
  now: Date = new Date(),
): Promise<{ ok: true } | Fail<"not-found" | "not-allowed" | "already-claimed" | "db-error">> {
  try {
    const db = createAdminSupabase();
    const { data: c, error: cErr } = await db.from("contacts").select("id, owner_id").eq("id", contactId).maybeSingle();
    if (cErr) throw cErr;
    if (!c) return { ok: false, reason: "not-found" };
    if (actor.id !== "" && c.owner_id === actor.id && canUseSales(actor)) return { ok: true };
    const check = canClaimContact({ owner_id: c.owner_id }, actor);
    if (!check.ok) return { ok: false, reason: check.reason === "already-claimed" ? "already-claimed" : "not-allowed" };

    // Atomic: only succeeds while the contact is still unclaimed.
    const iso = now.toISOString();
    const { data: won, error } = await db
      .from("contacts")
      .update({ owner_id: actor.id, claimed_at: iso, next_followup_at: nextFollowupFor("claimed", now)!.toISOString() })
      .eq("id", contactId)
      .is("owner_id", null)
      .select("id");
    if (error) throw error;
    if (!won || won.length === 0) return { ok: false, reason: "already-claimed" };
    const { error: actErr } = await db
      .from("contact_activities")
      .insert({ contact_id: contactId, agent_id: actor.id, kind: "claimed", created_at: iso });
    if (actErr) throw actErr;
    return { ok: true };
  } catch (e) {
    return dbError("claimContact", e);
  }
}

async function loadOwned(actor: Actor, contactId: string) {
  const db = createAdminSupabase();
  const { data: c, error } = await db
    .from("contacts")
    .select("id, owner_id")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  if (!c) return { ok: false as const, reason: "not-found" as const };
  const check = canActOnContact({ owner_id: c.owner_id }, actor);
  if (!check.ok) return { ok: false as const, reason: "not-owner" as const };
  return { ok: true as const };
}

export async function logOutcome(
  actor: Actor,
  contactId: string,
  input: { kind: OutcomeKind; askedToStop?: boolean },
  now: Date = new Date(),
): Promise<{ ok: true; nextFollowupAt: string | null } | Fail<"not-found" | "not-owner" | "db-error">> {
  try {
    const gate = await loadOwned(actor, contactId);
    if (!gate.ok) return gate;
    const db = createAdminSupabase();
    const iso = now.toISOString();
    const next = input.askedToStop ? null : nextFollowupFor(input.kind, now);
    const insertActivity = async () => {
      const { error: actErr } = await db.from("contact_activities").insert({
        contact_id: contactId,
        agent_id: actor.id,
        kind: input.kind,
        body: input.askedToStop ? "Asked me to stop" : null,
        created_at: iso,
      });
      if (actErr) throw actErr;
    };
    const patch: { last_outcome: string; next_followup_at: string | null; do_not_contact_at?: string } = {
      last_outcome: input.kind,
      next_followup_at: next ? next.toISOString() : null,
    };
    if (input.askedToStop) patch.do_not_contact_at = iso;
    // Stop requests: update the contact first so a failure never leaves a sendable contact with a "stop" timeline.
    if (!input.askedToStop) await insertActivity();
    let upd = db.from("contacts").update(patch).eq("id", contactId);
    if (!isAdminRole(actor)) upd = upd.eq("owner_id", actor.id);
    const { data: updated, error } = await upd.select("id");
    if (error) throw error;
    if (!updated || updated.length === 0) return { ok: false, reason: "not-owner" };
    if (input.askedToStop) await insertActivity();
    return { ok: true, nextFollowupAt: next ? next.toISOString() : null };
  } catch (e) {
    return dbError("logOutcome", e);
  }
}

export async function addNote(
  actor: Actor,
  contactId: string,
  body: string,
): Promise<{ ok: true } | Fail<"not-found" | "not-owner" | "db-error">> {
  try {
    const gate = await loadOwned(actor, contactId);
    if (!gate.ok) return gate;
    const { error } = await createAdminSupabase()
      .from("contact_activities")
      .insert({ contact_id: contactId, agent_id: actor.id, kind: "note", body });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return dbError("addNote", e);
  }
}

export async function addLead(
  actor: Actor,
  input: { phone: string; name?: string; email?: string; profession?: string; note?: string },
  now: Date = new Date(),
): Promise<
  | { ok: true; contactId: string }
  | { ok: false; reason: "invalid-phone"; detail: "empty" | "ambiguous" }
  | { ok: false; reason: "duplicate"; contactId: string | null; ownerName: string | null }
  | Fail<"not-allowed" | "db-error">
> {
  if (actor.role !== "sales_agent" && actor.role !== "admin" && actor.role !== "super_admin") {
    return { ok: false, reason: "not-allowed" };
  }
  if (actor.id === "") return { ok: false, reason: "not-allowed" };
  const phone = normalizePhone(input.phone);
  if (!phone.ok) return { ok: false, reason: "invalid-phone", detail: phone.reason };
  try {
    const db = createAdminSupabase();
    const { data: existing, error: exErr } = await db
      .from("contacts")
      .select("id, owner_id")
      .eq("phone_e164", phone.e164)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) {
      const names = await ownerNames(existing.owner_id ? [existing.owner_id] : []);
      return {
        ok: false,
        reason: "duplicate",
        contactId: existing.id,
        ownerName: existing.owner_id ? names.get(existing.owner_id) ?? null : null,
      };
    }
    const iso = now.toISOString();
    const { data, error } = await db
      .from("contacts")
      .insert({
        full_name: input.name ?? "",
        phone_e164: phone.e164,
        phone_raw: input.phone,
        email: input.email ? input.email.toLowerCase() : null,
        profession: input.profession ?? null,
        consent_basis: "enquiry",
        owner_id: actor.id,
        claimed_at: iso,
        next_followup_at: iso,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, reason: "duplicate", contactId: null, ownerName: null };
      throw error;
    }
    const rows = [{ contact_id: data.id, agent_id: actor.id, kind: "claimed", created_at: iso }] as {
      contact_id: string;
      agent_id: string;
      kind: string;
      body?: string;
      created_at: string;
    }[];
    if (input.note) rows.push({ contact_id: data.id, agent_id: actor.id, kind: "note", body: input.note, created_at: iso });
    const { error: actErr } = await db.from("contact_activities").insert(rows);
    if (actErr) throw actErr;
    return { ok: true, contactId: data.id };
  } catch (e) {
    return dbError("addLead", e);
  }
}

/** Admin only: assign contacts to a sales agent, or release them (agentId null). */
export async function assignContacts(
  admin: Actor,
  contactIds: string[],
  agentId: string | null,
  now: Date = new Date(),
): Promise<{ ok: true; count: number } | Fail<"not-allowed" | "invalid-agent" | "db-error">> {
  if (admin.role !== "admin" && admin.role !== "super_admin") return { ok: false, reason: "not-allowed" };
  try {
    const db = createAdminSupabase();
    let agentName = "";
    if (agentId !== null) {
      const { data: p, error: pErr } = await db.from("profiles").select("id, role, full_name").eq("id", agentId).maybeSingle();
      if (pErr) throw pErr;
      if (!p || p.role !== "sales_agent") return { ok: false, reason: "invalid-agent" };
      agentName = p.full_name ?? "";
    }
    const iso = now.toISOString();
    const { data: updated, error } = await db
      .from("contacts")
      .update({
        owner_id: agentId,
        claimed_at: agentId ? iso : null,
        next_followup_at: agentId ? iso : null,
      })
      .in("id", contactIds)
      .select("id");
    if (error) throw error;
    const done = updated ?? [];
    if (done.length > 0) {
      const { error: actErr } = await db.from("contact_activities").insert(
        done.map((c) => ({
          contact_id: c.id,
          agent_id: admin.id,
          kind: agentId ? "reassigned" : "released",
          body: agentId ? `Assigned to ${agentName}` : "Released to unclaimed",
          created_at: iso,
        })),
      );
      if (actErr) throw actErr;
    }
    return { ok: true, count: done.length };
  } catch (e) {
    return dbError("assignContacts", e);
  }
}
