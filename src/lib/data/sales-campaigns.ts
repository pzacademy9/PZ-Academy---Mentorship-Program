import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Actor } from "@/lib/crm/ownership";
import { chunk } from "@/lib/crm/assignment";
import { courseNameFromLabel } from "@/lib/crm/product-label";
import { getNumberForAgent } from "@/lib/data/sales-numbers";
import {
  defaultCampaignName,
  MAX_CAMPAIGN_RECIPIENTS,
  varietyBlocked,
  type CampaignRecipientStatus,
  type CampaignStatus,
  type DroppedCounts,
} from "@/lib/crm/campaign-rules";
import type {
  AudienceRowJson,
  CampaignDetailJson,
  CampaignListItemJson,
} from "@/lib/crm/campaign-ui";

type Fail<R extends string> = { ok: false; reason: R };
const dbError = (tag: string, e: unknown): Fail<"db-error"> => {
  console.error(`[sales-campaigns] ${tag}`, e);
  return { ok: false, reason: "db-error" };
};

const canUse = (a: Actor) => a.role === "sales_agent" || a.role === "admin" || a.role === "super_admin";
const isAdminRole = (a: Actor) => a.role === "admin" || a.role === "super_admin";

const ID_CHUNK = 200;
const MAX_AUDIENCE = 3000;
const AUDIENCE_PAGE = 1000;
const RECIPIENT_INSERT_CHUNK = 500;
/** PostgREST returns at most 1000 rows per request, so large reads page with .range. */
const READ_PAGE = 1000;

async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await fetchPage(from, from + READ_PAGE - 1);
    if (error) throw error;
    const page = data ?? [];
    out.push(...page);
    if (page.length < READ_PAGE) return out;
  }
}

export async function loadCampaignAudience(
  actor: Actor,
): Promise<{ ok: true; rows: AudienceRowJson[]; truncated: boolean } | Fail<"not-allowed" | "db-error">> {
  if (!canUse(actor) || actor.id === "") return { ok: false, reason: "not-allowed" };
  try {
    const db = createAdminSupabase();
    const rows: AudienceRowJson[] = [];
    let truncated = false;
    for (let from = 0; ; from += AUDIENCE_PAGE) {
      const { data, error } = await db
        .from("contacts")
        .select("id, full_name, phone_e164, last_outcome, do_not_contact_at, whatsapp_unsubscribed_at")
        .eq("owner_id", actor.id)
        .order("updated_at", { ascending: false })
        .range(from, from + AUDIENCE_PAGE - 1);
      if (error) throw error;
      const page = data ?? [];
      for (const c of page) {
        if (!c.phone_e164 || c.do_not_contact_at || c.whatsapp_unsubscribed_at) continue;
        if (rows.length >= MAX_AUDIENCE) { truncated = true; break; }
        rows.push({ id: c.id, fullName: c.full_name, phone: c.phone_e164, lastOutcome: c.last_outcome, courses: [] });
      }
      if (truncated) break;
      if (page.length < AUDIENCE_PAGE) break;
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const slice of chunk(rows.map((r) => r.id), ID_CHUNK)) {
      const { data, error } = await db.from("crm_contact_segment_source").select("id, product_labels").in("id", slice);
      if (error) throw error;
      for (const s of data ?? []) {
        const row = s.id ? byId.get(s.id) : undefined;
        if (!row) continue;
        row.courses = Array.from(
          new Set((s.product_labels ?? []).map((l: string) => courseNameFromLabel(l)).filter((c: string) => c !== "")),
        );
      }
    }
    return { ok: true, rows, truncated };
  } catch (e) {
    return dbError("loadCampaignAudience", e);
  }
}

export async function createCampaign(
  actor: Actor,
  input: { name?: string; messageTemplate: string; contactIds: string[]; numberId: string; followupInHours: number },
  now: Date = new Date(),
): Promise<
  | { ok: true; campaignId: string; recipientCount: number; dropped: DroppedCounts }
  | Fail<"not-allowed" | "too-many" | "variety" | "number-not-assigned" | "empty-audience" | "db-error">
> {
  if (!canUse(actor) || actor.id === "") return { ok: false, reason: "not-allowed" };
  const unique = Array.from(new Set(input.contactIds));
  const dropped: DroppedCounts = { notOwned: 0, doNotContact: 0, noPhone: 0, duplicates: input.contactIds.length - unique.length };
  if (unique.length > MAX_CAMPAIGN_RECIPIENTS) return { ok: false, reason: "too-many" };
  try {
    const number = await getNumberForAgent(actor.id, isAdminRole(actor), input.numberId);
    if (!number) return { ok: false, reason: "number-not-assigned" };

    const db = createAdminSupabase();
    const found = new Map<
      string,
      { id: string; full_name: string; phone_e164: string | null; owner_id: string | null; do_not_contact_at: string | null; whatsapp_unsubscribed_at: string | null }
    >();
    for (const slice of chunk(unique, ID_CHUNK)) {
      const { data, error } = await db
        .from("contacts")
        .select("id, full_name, phone_e164, owner_id, do_not_contact_at, whatsapp_unsubscribed_at")
        .in("id", slice);
      if (error) throw error;
      for (const c of data ?? []) found.set(c.id, c);
    }

    const clean: { id: string; full_name: string; phone_e164: string }[] = [];
    for (const id of unique) {
      const c = found.get(id);
      if (!c || c.owner_id !== actor.id) dropped.notOwned += 1;
      else if (c.do_not_contact_at || c.whatsapp_unsubscribed_at) dropped.doNotContact += 1;
      else if (!c.phone_e164) dropped.noPhone += 1;
      else clean.push({ id: c.id, full_name: c.full_name, phone_e164: c.phone_e164 });
    }
    if (clean.length === 0) return { ok: false, reason: "empty-audience" };
    if (varietyBlocked(input.messageTemplate, clean.length)) return { ok: false, reason: "variety" };

    const { data: batch, error: bErr } = await db
      .from("whatsapp_batches")
      .insert({
        name: input.name?.trim() || defaultCampaignName(now),
        message_template: input.messageTemplate,
        segment: [],
        recipient_count: clean.length,
        created_by: actor.id,
        owner_agent_id: actor.id,
        number_id: input.numberId,
        followup_in_hours: input.followupInHours,
        status: "active",
      })
      .select("id")
      .single();
    if (bErr || !batch) throw bErr ?? new Error("batch insert returned no row");

    try {
      for (const slice of chunk(clean, RECIPIENT_INSERT_CHUNK)) {
        const { error } = await db.from("whatsapp_batch_recipients").insert(
          slice.map((c) => ({ batch_id: batch.id, contact_id: c.id, full_name: c.full_name, phone_e164: c.phone_e164 })),
        );
        if (error) throw error;
      }
    } catch (e) {
      const { error: delErr } = await db.from("whatsapp_batches").delete().eq("id", batch.id);
      if (delErr) console.error("[sales-campaigns] createCampaign cleanup", delErr);
      throw e;
    }
    return { ok: true, campaignId: batch.id, recipientCount: clean.length, dropped };
  } catch (e) {
    return dbError("createCampaign", e);
  }
}

type BatchRow = {
  id: string;
  name: string;
  status: string;
  recipient_count: number;
  paused_reason: string | null;
  created_at: string;
};

const toListItem = (b: BatchRow, pending: number, sent: number): CampaignListItemJson => ({
  id: b.id,
  name: b.name,
  status: b.status as CampaignStatus,
  recipientCount: b.recipient_count,
  sentCount: sent,
  pendingCount: pending,
  pausedReason: b.paused_reason,
  createdAt: b.created_at,
});

export async function listMyCampaigns(
  actor: Actor,
): Promise<{ ok: true; campaigns: CampaignListItemJson[] } | Fail<"not-allowed" | "db-error">> {
  if (!canUse(actor) || actor.id === "") return { ok: false, reason: "not-allowed" };
  try {
    const db = createAdminSupabase();
    const { data, error } = await db
      .from("whatsapp_batches")
      .select("id, name, status, recipient_count, paused_reason, created_at")
      .eq("owner_agent_id", actor.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const batches = data ?? [];
    const pending = new Map<string, number>();
    const sent = new Map<string, number>();
    for (const slice of chunk(batches.map((b) => b.id), ID_CHUNK)) {
      const rec = await readAllPages((from, to) =>
        db
          .from("whatsapp_batch_recipients")
          .select("batch_id, status")
          .in("batch_id", slice)
          .in("status", ["pending", "sent"])
          .order("id", { ascending: true })
          .range(from, to),
      );
      for (const r of rec) {
        const m = r.status === "pending" ? pending : sent;
        m.set(r.batch_id, (m.get(r.batch_id) ?? 0) + 1);
      }
    }
    return { ok: true, campaigns: batches.map((b) => toListItem(b, pending.get(b.id) ?? 0, sent.get(b.id) ?? 0)) };
  } catch (e) {
    return dbError("listMyCampaigns", e);
  }
}

export async function getMyCampaign(
  actor: Actor,
  id: string,
): Promise<{ ok: true; campaign: CampaignDetailJson } | Fail<"not-allowed" | "not-found" | "db-error">> {
  if (!canUse(actor) || actor.id === "") return { ok: false, reason: "not-allowed" };
  try {
    const db = createAdminSupabase();
    const { data: b, error } = await db
      .from("whatsapp_batches")
      .select("id, name, status, recipient_count, paused_reason, created_at, message_template, number_id, followup_in_hours, owner_agent_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    // Another agent's campaign looks exactly like a missing one, so ids cannot be probed.
    if (!b || b.owner_agent_id !== actor.id) return { ok: false, reason: "not-found" };
    const rec = await readAllPages((from, to) =>
      db
        .from("whatsapp_batch_recipients")
        .select("id, contact_id, full_name, phone_e164, status")
        .eq("batch_id", id)
        .order("full_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    const recipients = rec.map((r) => ({
      id: r.id,
      contactId: r.contact_id,
      fullName: r.full_name,
      phone: r.phone_e164,
      status: r.status as CampaignRecipientStatus,
    }));
    const pending = recipients.filter((r) => r.status === "pending").length;
    return {
      ok: true,
      campaign: {
        ...toListItem(b, pending, recipients.filter((r) => r.status === "sent").length),
        messageTemplate: b.message_template,
        numberId: b.number_id,
        followupInHours: b.followup_in_hours ?? 24,
        recipients,
      },
    };
  } catch (e) {
    return dbError("getMyCampaign", e);
  }
}
