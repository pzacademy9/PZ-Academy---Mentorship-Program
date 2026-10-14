// src/lib/data/landing-registrations.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { normalizeContent } from "@/lib/landing/content";
import type { Mode, RegistrationConfig, RegistrationStatus } from "@/lib/landing/registration/config";
import type { QuoteResult } from "@/lib/landing/registration/pricing";
import type { PromoResult } from "@/lib/landing/registration/promo";
import type { RegisterPayload } from "@/lib/landing/registration/submit-schema";
import { registrationOptionLabel } from "@/lib/landing/registration/labels";
import { cleanUtm } from "@/lib/landing/registration/utm";
import { normalizePromoCode } from "@/lib/data/landing-promo-codes";

type RegRow = Database["public"]["Tables"]["landing_registrations"]["Row"];
type RegInsert = Database["public"]["Tables"]["landing_registrations"]["Insert"];
type CreateArgs = Database["public"]["Functions"]["landing_create_registration"]["Args"];

export type { RegistrationStatus } from "@/lib/landing/registration/config";
export type RowType = "individual" | "lead" | "member";
export type OkQuote = Extract<QuoteResult, { ok: true }>;
export type OkPromo = Extract<PromoResult, { ok: true }>;

export interface CreateRegistrationInput {
  page: { id: string; refPrefix: string | null };
  config: RegistrationConfig;
  payload: RegisterPayload;
  quote: OkQuote;
  promo: OkPromo | null;
  voucherUrl: string;
  studentId: string | null;
  agentId: string | null;
  isTest: boolean;
}
export type CreateRegistrationResult =
  | { ok: true; refId: string; registrationIds: string[]; total: number; currency: string }
  | { ok: false; reason: "promo_exhausted" | "capacity_full" | "db-error" };

export interface OpenRegistration {
  id: string;
  refId: string;
  status: "pending" | "underpaid";
  name: string;
  optionLabel: string;
  optionKeys: string[];
  mode: Mode;
  expectedAmount: number | null;
  currency: string;
}

export interface RegistrationRecord {
  id: string;
  pageId: string;
  rowType: RowType;
  leadRegistrationId: string | null;
  refId: string | null;
  name: string;
  email: string;
  whatsapp: string;
  profession: string;
  city: string;
  region: string;
  discovery: string;
  consent: boolean;
  optionLabel: string;
  optionKeys: string[];
  mode: Mode;
  tierKey: string;
  groupSize: number;
  promoCodeText: string | null;
  expectedAmount: number | null;
  amountReceived: number | null;
  currency: string;
  paymentMethod: string | null;
  voucherUrl: string | null;
  status: RegistrationStatus;
  emailStatus: string | null;
  agentId: string | null;
  studentId: string | null;
  utm: Record<string, string>;
  isTest: boolean;
  createdAt: string;
}
export interface RegistrationBundle { lead: RegistrationRecord; members: RegistrationRecord[] }

const OPEN_STATUSES = ["pending", "underpaid"];
const HEAD_ROW_TYPES = ["individual", "lead"];

const lower = (s: string) => s.trim().toLowerCase();
// Tolerant readers: column nullability lives in Part A's types; these keep the mapping total.
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const strArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function mapRecord(r: RegRow): RegistrationRecord {
  const row = r as unknown as Record<string, unknown>;
  return {
    id: str(row.id),
    pageId: str(row.page_id),
    rowType: (["individual", "lead", "member"].includes(str(row.row_type)) ? row.row_type : "individual") as RowType,
    leadRegistrationId: strOrNull(row.lead_registration_id),
    refId: strOrNull(row.ref_id),
    name: str(row.name),
    email: str(row.email),
    whatsapp: str(row.whatsapp),
    profession: str(row.profession),
    city: str(row.city),
    region: str(row.region),
    discovery: str(row.discovery),
    consent: row.consent === true,
    optionLabel: str(row.option_label),
    optionKeys: strArray(row.option_keys),
    mode: row.mode === "recorded" ? "recorded" : "live",
    tierKey: str(row.tier_key) || "individual",
    groupSize: Number(row.group_size ?? 1),
    promoCodeText: strOrNull(row.promo_code_text),
    expectedAmount: numOrNull(row.expected_amount),
    amountReceived: numOrNull(row.amount_received),
    currency: str(row.currency),
    paymentMethod: strOrNull(row.payment_method),
    voucherUrl: strOrNull(row.voucher_url),
    status: str(row.status) as RegistrationStatus,
    emailStatus: strOrNull(row.email_status),
    agentId: strOrNull(row.agent_id),
    studentId: strOrNull(row.student_id),
    utm: cleanUtm(row.utm),
    isTest: row.is_test === true,
    createdAt: str(row.created_at),
  };
}

/** A promo that took nothing off the price is not a use: it must not burn a max_uses slot. */
function effectivePromo(promo: OkPromo | null): OkPromo | null {
  return promo && promo.discount > 0 ? promo : null;
}

/**
 * One row per person, lead/individual FIRST (the RPC gives that row the ref id and links
 * the rest to it). Members carry no money, voucher or payment method: the lead pays for
 * the group. Members are never linked to the logged-in user (they are other people).
 */
export function buildRegistrationRows(input: CreateRegistrationInput): RegInsert[] {
  const { payload: p, quote: q } = input;
  const promo = effectivePromo(input.promo);
  const status: RegistrationStatus = q.isFree ? "free" : "pending";
  const shared = {
    page_id: input.page.id,
    option_label: registrationOptionLabel(input.config, q),
    option_keys: q.optionKeys,
    mode: q.mode,
    tier_key: q.tierKey,
    group_size: q.groupSize,
    region: q.regionKey,
    currency: q.currency,
    status,
    agent_id: input.agentId,
    referral_code: lower(p.attribution.refCode),
    utm: cleanUtm(p.attribution.utm) as unknown as Json,
    session_id: p.attribution.sessionId.trim(),
    is_test: input.isTest,
    promo_code_id: promo?.promoId ?? null,
    promo_code_text: promo ? normalizePromoCode(promo.code) : "",
  };
  const head: RegInsert = {
    ...shared,
    row_type: q.tierKey === "individual" ? "individual" : "lead",
    name: p.lead.name.trim(),
    email: lower(p.lead.email),
    whatsapp: p.lead.whatsapp.trim(),
    profession: p.lead.profession.trim(),
    city: p.lead.city.trim(),
    discovery: p.lead.discovery.trim(),
    consent: true,
    expected_amount: promo ? promo.total : q.total,
    payment_method: q.isFree ? "" : p.paymentMethod,
    voucher_url: input.voucherUrl,
    student_id: input.studentId,
    fbp: p.attribution.fbp.trim(),
    fbc: p.attribution.fbc.trim(),
    event_id: p.attribution.eventId.trim(),
  };
  const members: RegInsert[] = p.members.map((m) => ({
    ...shared,
    row_type: "member",
    name: m.name.trim(),
    email: lower(m.email),
    whatsapp: m.whatsapp.trim(),
    profession: m.profession.trim(),
    city: "",
    discovery: "",
    consent: true, // covered by the group lead's consent, as on the legacy sheets
    expected_amount: 0,  // the lead's row carries the whole-registration total
    payment_method: "",
    voucher_url: "",
    student_id: null,
    fbp: "",
    fbc: "",
    event_id: "",
  }));
  return [head, ...members];
}

export async function createRegistration(input: CreateRegistrationInput): Promise<CreateRegistrationResult> {
  const admin = createAdminSupabase();
  if (!input.isTest && !input.page.refPrefix && input.config.refPrefix.trim()) {
    // The ref counter needs the page's prefix; pages registered before their sheet existed get it here.
    await admin.from("landing_pages").update({ ref_prefix: input.config.refPrefix.trim().toUpperCase() }).eq("id", input.page.id).is("ref_prefix", null);
  }
  const promo = effectivePromo(input.promo);
  const args = {
    p_page_id: input.page.id,
    p_rows: buildRegistrationRows(input) as unknown as Json,
    p_promo_id: promo?.promoId ?? null,
    p_is_test: input.isTest,
    p_capacity: input.config.capacity,
  };
  const { data, error } = await admin.rpc("landing_create_registration", args as unknown as CreateArgs);
  if (error) {
    // Only the RPC's own business errors are surfaced; everything else (invalid_rows, page_not_found,
    // 23514 / 22P02 and the like) is a generic failure. Only the code is logged, never SQL text.
    const text = `${error.message ?? ""} ${error.details ?? ""}`;
    if (text.includes("promo_exhausted")) return { ok: false, reason: "promo_exhausted" };
    if (text.includes("capacity_full")) return { ok: false, reason: "capacity_full" };
    console.error("[landing-registrations] create failed:", error.code);
    return { ok: false, reason: "db-error" };
  }
  const out = (data ?? {}) as { ref_id?: unknown; registration_ids?: unknown };
  const ids = strArray(out.registration_ids);
  if (typeof out.ref_id !== "string" || out.ref_id === "" || ids.length === 0) return { ok: false, reason: "db-error" };
  return { ok: true, refId: out.ref_id, registrationIds: ids, total: promo ? promo.total : input.quote.total, currency: input.quote.currency };
}

/**
 * Ref + email lookup for the public status page. A member uses the lead's ref and their own
 * email; everyone in a group shares the lead's status. With `pageId` (the public status route
 * passes the page of the slug in the URL) a ref from another event is null. Throws on a read error.
 */
export async function getRegistrationStatus(
  refId: string,
  email: string,
  pageId?: string,
): Promise<{ status: RegistrationStatus; name: string; eventLabel: string } | null> {
  const ref = refId.trim().toUpperCase();
  const mail = lower(email);
  if (!ref || !mail) return null;
  const admin = createAdminSupabase();
  let headQuery = admin.from("landing_registrations").select("id, page_id, name, email, status").eq("ref_id", ref);
  if (pageId) headQuery = headQuery.eq("page_id", pageId);
  const { data: head, error } = await headQuery.maybeSingle();
  if (error) throw error;
  if (!head) return null;
  let name: string | null = head.email === mail ? head.name : null;
  if (name === null) {
    const { data: m, error: mErr } = await admin.from("landing_registrations").select("name").eq("lead_registration_id", head.id).eq("email", mail).maybeSingle();
    if (mErr) throw mErr;
    name = m?.name ?? null;
  }
  if (name === null) return null;
  const { data: page } = await admin.from("landing_pages").select("title, published").eq("id", head.page_id).maybeSingle();
  const eventLabel = page ? normalizeContent(page.published).registration.eventLabel || page.title : "";
  return { status: head.status as RegistrationStatus, name, eventLabel };
}

/** Resubmission: a new voucher on the same row. Only while the payment is still open. */
export async function attachVoucher(refId: string, email: string, voucherUrl: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_registrations")
    .update({ voucher_url: voucherUrl })
    .eq("ref_id", refId.trim().toUpperCase())
    .eq("email", lower(email))
    .in("status", OPEN_STATUSES)
    .select("id");
  if (error) {
    console.error("[landing-registrations] attachVoucher failed:", error.code);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function findOpenRegistration(pageId: string, email: string): Promise<OpenRegistration | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_registrations")
    .select("id, ref_id, status, name, option_label, option_keys, mode, expected_amount, currency")
    .eq("page_id", pageId)
    .eq("email", lower(email))
    .in("row_type", HEAD_ROW_TYPES)
    .in("status", OPEN_STATUSES)
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.ref_id) return null;
  const row = data as unknown as Record<string, unknown>;
  return {
    id: str(row.id),
    refId: str(row.ref_id),
    status: row.status === "underpaid" ? "underpaid" : "pending",
    name: str(row.name),
    optionLabel: str(row.option_label),
    optionKeys: strArray(row.option_keys),
    mode: row.mode === "recorded" ? "recorded" : "live",
    expectedAmount: numOrNull(row.expected_amount),
    currency: str(row.currency),
  };
}

/** Links guest registrations to the account that just signed in with the same email. Never throws. */
export async function linkRegistrationsToStudent(userId: string, email: string): Promise<number> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin
      .from("landing_registrations")
      .update({ student_id: userId })
      .eq("email", lower(email))
      .is("student_id", null)
      .eq("is_test", false)
      .select("id");
    if (error) {
      console.warn("[landing-registrations] link failed:", error.code);
      return 0;
    }
    return (data ?? []).length;
  } catch {
    return 0;
  }
}

/** Registrations (not members) by this email since `sinceIso`. Fails open (0) so a DB blip never blocks sign-ups. */
export async function countRecentRegistrations(email: string, sinceIso: string): Promise<number> {
  const admin = createAdminSupabase();
  const { count, error } = await admin
    .from("landing_registrations")
    .select("id", { count: "exact", head: true })
    .eq("email", lower(email))
    .in("row_type", HEAD_ROW_TYPES)
    .gte("created_at", sinceIso);
  if (error) return 0;
  return count ?? 0;
}

export async function getRegistrationBundle(leadId: string): Promise<RegistrationBundle | null> {
  const admin = createAdminSupabase();
  const { data: head, error } = await admin.from("landing_registrations").select("*").eq("id", leadId).maybeSingle();
  if (error) throw error;
  if (!head) return null;
  const { data: members, error: mErr } = await admin
    .from("landing_registrations")
    .select("*")
    .eq("lead_registration_id", leadId)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;
  return { lead: mapRecord(head as RegRow), members: (members ?? []).map((m) => mapRecord(m as RegRow)) };
}

export async function markEmailStatus(registrationId: string, value: string): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("landing_registrations").update({ email_status: value }).eq("id", registrationId);
  if (error) throw error;
}
