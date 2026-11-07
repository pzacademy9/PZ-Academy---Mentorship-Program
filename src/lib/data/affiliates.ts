// src/lib/data/affiliates.ts
// Server data layer for affiliates (service role). The rules live in lib/affiliates/service.ts.
import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { AffiliateApplication } from "@/lib/validations/affiliate-application";
import {
  acceptApplicationWith,
  updateAffiliateWith,
  type AcceptResult,
  type AffiliateStatus,
  type CommissionMode,
  type Team,
  type UpdatePatch,
  type UpdateResult,
} from "@/lib/affiliates/service";

type Row = Database["public"]["Tables"]["affiliates"]["Row"];

// The list never selects `token`: it is a secret that opens the affiliate's private page.
const LIST_COLUMNS =
  "id, status, name, email, whatsapp, city_country, answers, code, team, commission_mode, manual_percent, opening_secured, opening_commission, opening_withdrawn, is_imported, terms_accepted_at, terms_version, accepted_at, dropped_at, left_at, created_at";
const DETAIL_COLUMNS = `${LIST_COLUMNS}, token`;
const UNIQUE_VIOLATION = "23505";

export interface AffiliateRow {
  id: string;
  status: AffiliateStatus;
  name: string;
  email: string;
  whatsapp: string;
  cityCountry: string;
  answers: Record<string, unknown>;
  code: string | null;
  team: Team | null;
  commissionMode: CommissionMode;
  manualPercent: number | null;
  openingSecured: number;
  openingCommission: number;
  openingWithdrawn: number;
  isImported: boolean;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  acceptedAt: string | null;
  droppedAt: string | null;
  leftAt: string | null;
  createdAt: string;
}
export type AffiliateDetail = AffiliateRow & { token: string | null };

type PartialRow = Omit<Row, "token" | "code_serial" | "updated_at"> & { token?: string | null };

function mapRow(r: PartialRow): AffiliateRow {
  return {
    id: r.id,
    status: r.status as AffiliateStatus,
    name: r.name,
    email: r.email,
    whatsapp: r.whatsapp,
    cityCountry: r.city_country,
    answers: r.answers && typeof r.answers === "object" && !Array.isArray(r.answers) ? (r.answers as Record<string, unknown>) : {},
    code: r.code,
    team: (r.team as Team | null) ?? null,
    commissionMode: r.commission_mode as CommissionMode,
    manualPercent: r.manual_percent === null ? null : Number(r.manual_percent),
    openingSecured: r.opening_secured,
    openingCommission: Number(r.opening_commission),
    openingWithdrawn: Number(r.opening_withdrawn),
    isImported: r.is_imported,
    termsAcceptedAt: r.terms_accepted_at,
    termsVersion: r.terms_version,
    acceptedAt: r.accepted_at,
    droppedAt: r.dropped_at,
    leftAt: r.left_at,
    createdAt: r.created_at,
  };
}

export type CreateApplicationResult = { ok: true; id: string } | { ok: false; reason: "duplicate" | "db-error" };

/** Saves a new application. The same email (any capitals) twice is a duplicate. */
export async function createApplication(app: AffiliateApplication, termsVersion: string): Promise<CreateApplicationResult> {
  const answers = {
    city: app.city,
    country: app.country,
    status: app.status,
    organization: app.organization,
    field: app.field,
    commissionExperience: app.commissionExperience,
    eventsManaged: app.eventsManaged,
    promotingPrograms: app.promotingPrograms,
    onlineSales: app.onlineSales,
    ratings: app.ratings,
    hoursPerWeek: app.hoursPerWeek,
    linkedin: app.linkedin,
    why: app.why,
  };
  const { data, error } = await createAdminSupabase()
    .from("affiliates")
    .insert({
      name: app.name,
      email: app.email,
      whatsapp: app.whatsapp,
      city_country: `${app.city}, ${app.country}`,
      answers: answers as unknown as Json,
      terms_accepted_at: new Date().toISOString(),
      terms_version: termsVersion,
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.code === UNIQUE_VIOLATION ? "duplicate" : "db-error" };
  return { ok: true, id: data.id };
}

/** Newest first. Never includes the private token. */
export async function listAffiliates(filter: { status?: AffiliateStatus } = {}): Promise<AffiliateRow[]> {
  let q = createAdminSupabase().from("affiliates").select(LIST_COLUMNS).order("created_at", { ascending: false });
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as unknown as PartialRow));
}

/** One affiliate with the private token, for the admin's copy-link button. Null when unknown. */
export async function getAffiliateDetail(id: string): Promise<AffiliateDetail | null> {
  const { data, error } = await createAdminSupabase().from("affiliates").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as PartialRow;
  return { ...mapRow(r), token: r.token ?? null };
}

export function acceptApplication(id: string, opts: { code?: string; team?: Team | null }): Promise<AcceptResult> {
  const admin = createAdminSupabase();
  return acceptApplicationWith(id, opts, {
    load: async (affiliateId) => {
      const { data, error } = await admin.from("affiliates").select("status, name, email").eq("id", affiliateId).maybeSingle();
      if (error) throw error;
      return data ? { status: data.status as AffiliateStatus, name: data.name, email: data.email } : null;
    },
    nextSerial: async () => {
      const { data, error } = await admin.rpc("next_affiliate_serial");
      if (error || typeof data !== "number") throw error ?? new Error("No serial");
      return data;
    },
    accept: async (affiliateId, v) => {
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("affiliates")
        .update({ status: "accepted", code: v.code, code_serial: v.codeSerial, token: v.token, team: v.team, accepted_at: now, updated_at: now })
        .eq("id", affiliateId)
        .eq("status", "applied")
        .select("id")
        .maybeSingle();
      if (error) return error.code === UNIQUE_VIOLATION ? "code-taken" : "db-error";
      return data ? "ok" : "not-applied";
    },
    makeToken: () => randomBytes(24).toString("base64url"),
  });
}

export type StatusResult = { ok: true } | { ok: false; reason: "not-found" | "wrong-status" | "db-error" };

async function changeStatus(id: string, from: AffiliateStatus[], to: "dropped" | "left"): Promise<StatusResult> {
  const now = new Date().toISOString();
  const { data, error } = await createAdminSupabase()
    .from("affiliates")
    .update(to === "dropped" ? { status: to, dropped_at: now, updated_at: now } : { status: to, left_at: now, updated_at: now })
    .eq("id", id)
    .in("status", from)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (data) return { ok: true };
  const { data: exists } = await createAdminSupabase().from("affiliates").select("id").eq("id", id).maybeSingle();
  return { ok: false, reason: exists ? "wrong-status" : "not-found" };
}

/** An applicant or an accepted affiliate can be dropped. */
export const dropAffiliate = (id: string) => changeStatus(id, ["applied", "accepted"], "dropped");
/** Only an accepted affiliate can be marked as left. */
export const markAffiliateLeft = (id: string) => changeStatus(id, ["accepted"], "left");

export function updateAffiliate(id: string, patch: UpdatePatch): Promise<UpdateResult> {
  const admin = createAdminSupabase();
  return updateAffiliateWith(id, patch, {
    load: async (affiliateId) => {
      const { data, error } = await admin.from("affiliates").select("commission_mode, manual_percent").eq("id", affiliateId).maybeSingle();
      if (error) throw error;
      return data
        ? { commissionMode: data.commission_mode as CommissionMode, manualPercent: data.manual_percent === null ? null : Number(data.manual_percent) }
        : null;
    },
    update: async (affiliateId, row) => {
      const { error } = await admin.from("affiliates").update({ ...row, updated_at: new Date().toISOString() }).eq("id", affiliateId);
      return error ? "db-error" : "ok";
    },
  });
}
