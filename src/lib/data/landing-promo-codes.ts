// src/lib/data/landing-promo-codes.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { PromoCode } from "@/lib/landing/registration/promo";

type Row = Database["public"]["Tables"]["landing_promo_codes"]["Row"];
type Insert = Database["public"]["Tables"]["landing_promo_codes"]["Insert"];
type Update = Database["public"]["Tables"]["landing_promo_codes"]["Update"];

export type PromoCodeInput = Omit<PromoCode, "id" | "usedCount">;
export type PromoWriteResult = { ok: true; id: string } | { ok: false; reason: "duplicate" | "not-found" | "invalid" | "db-error" };

const LEGACY_COLUMNS =
  "id, code, type, value, fixed_amounts, max_discount_percent, page_ids, option_keys, max_uses, used_count, one_per_email, starts_at, ends_at, active, owner_agent_id, is_owner_code, plain_percent, max_percent";
const COLUMNS = `${LEGACY_COLUMNS}, owner_affiliate_id`;
const UNDEFINED_COLUMN = "42703";
const UNIQUE_VIOLATION = "23505";

/**
 * Reads with the full column list. If the database does not have owner_affiliate_id yet (the code was deployed
 * before migration 0109 was pasted), asks again without it, so promo codes keep working for every visitor.
 */
async function readWithFallback<T>(run: (columns: string) => PromiseLike<{ data: T; error: { code?: string } | null }>) {
  const first = await run(COLUMNS);
  if (first.error?.code !== UNDEFINED_COLUMN) return first;
  return run(LEGACY_COLUMNS);
}
const CHECK_VIOLATION = "23514";

function failure(code: string | undefined): PromoWriteResult {
  if (code === UNIQUE_VIOLATION) return { ok: false, reason: "duplicate" };
  if (code === CHECK_VIOLATION) return { ok: false, reason: "invalid" };
  return { ok: false, reason: "db-error" };
}

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function numberRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function mapRow(r: Row): PromoCode {
  return {
    id: r.id,
    code: r.code,
    type: r.type === "fixed" ? "fixed" : "percent",
    value: Number(r.value),
    fixedAmounts: numberRecord(r.fixed_amounts),
    maxDiscountPercent: Number(r.max_discount_percent),
    pageIds: r.page_ids ?? [],
    optionKeys: r.option_keys ?? [],
    maxUses: r.max_uses,
    usedCount: r.used_count,
    oneperEmail: r.one_per_email,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    active: r.active,
    ownerAgentId: r.owner_agent_id,
    ownerAffiliateId: r.owner_affiliate_id ?? null,
    isOwnerCode: r.is_owner_code,
    plainPercent: Number(r.plain_percent),
    maxPercent: r.max_percent === null ? null : Number(r.max_percent),
  };
}

function toRow(i: Partial<PromoCodeInput>): Update {
  const row: Update = {};
  if (i.code !== undefined) row.code = normalizePromoCode(i.code);
  if (i.type !== undefined) row.type = i.type;
  if (i.value !== undefined) row.value = i.value;
  if (i.fixedAmounts !== undefined) row.fixed_amounts = i.fixedAmounts as unknown as Json;
  if (i.maxDiscountPercent !== undefined) row.max_discount_percent = i.maxDiscountPercent;
  if (i.pageIds !== undefined) row.page_ids = i.pageIds;
  if (i.optionKeys !== undefined) row.option_keys = i.optionKeys;
  if (i.maxUses !== undefined) row.max_uses = i.maxUses;
  if (i.oneperEmail !== undefined) row.one_per_email = i.oneperEmail;
  if (i.startsAt !== undefined) row.starts_at = i.startsAt;
  if (i.endsAt !== undefined) row.ends_at = i.endsAt;
  if (i.active !== undefined) row.active = i.active;
  if (i.ownerAgentId !== undefined) row.owner_agent_id = i.ownerAgentId;
  if (i.ownerAffiliateId !== undefined) row.owner_affiliate_id = i.ownerAffiliateId;
  if (i.isOwnerCode !== undefined) row.is_owner_code = i.isOwnerCode;
  if (i.plainPercent !== undefined) row.plain_percent = i.plainPercent;
  if (i.maxPercent !== undefined) row.max_percent = i.maxPercent;
  return row;
}

/** Codes are stored uppercase; lookups normalize first. Throws on a read error. */
export async function getPromoByCode(code: string): Promise<PromoCode | null> {
  const normalized = normalizePromoCode(code);
  if (!normalized) return null;
  const admin = createAdminSupabase();
  const { data, error } = await readWithFallback((cols) => admin.from("landing_promo_codes").select(cols).eq("code", normalized).maybeSingle());
  if (error) throw error;
  return data ? mapRow(data as unknown as Row) : null;
}

const DEFAULT_MAX_PERCENT = 30;

/** The highest percent anyone may type after an owner code. Falls back to 30 if the row is missing. */
export async function getPromoSettings(): Promise<{ maxPercent: number }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_promo_settings").select("max_percent").eq("id", true).maybeSingle();
  if (error) throw error;
  return { maxPercent: data ? Number(data.max_percent) : DEFAULT_MAX_PERCENT };
}

export async function setPromoSettings(maxPercent: number): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("landing_promo_settings")
    .upsert({ id: true, max_percent: maxPercent, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** One code by id, or null. Throws on a read error. */
export async function getPromoById(id: string): Promise<PromoCode | null> {
  const admin = createAdminSupabase();
  const { data, error } = await readWithFallback((cols) => admin.from("landing_promo_codes").select(cols).eq("id", id).maybeSingle());
  if (error) throw error;
  return data ? mapRow(data as unknown as Row) : null;
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const admin = createAdminSupabase();
  const { data, error } = await readWithFallback((cols) => admin.from("landing_promo_codes").select(cols).order("created_at", { ascending: false }));
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map((r) => mapRow(r));
}

export async function createPromoCode(input: PromoCodeInput): Promise<PromoWriteResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_promo_codes").insert(toRow(input) as Insert).select("id").single();
  if (error) return failure(error.code);
  return { ok: true, id: data.id };
}

export async function updatePromoCode(id: string, patch: Partial<PromoCodeInput>): Promise<PromoWriteResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_promo_codes").update(toRow(patch)).eq("id", id).select("id").maybeSingle();
  if (error) return failure(error.code);
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, id: data.id };
}

/**
 * True when this email already has a real (non-test) registration that used the promo.
 * Throws on a read error: a one-per-email code must not be granted on a DB blip.
 */
export async function emailUsedPromo(promoId: string, email: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { count, error } = await admin
    .from("landing_registrations")
    .select("id", { count: "exact", head: true })
    .eq("promo_code_id", promoId)
    .eq("email", email.trim().toLowerCase())
    .eq("is_test", false);
  if (error) throw error;
  return (count ?? 0) > 0;
}
