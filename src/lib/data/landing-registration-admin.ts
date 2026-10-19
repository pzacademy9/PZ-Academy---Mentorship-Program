// src/lib/data/landing-registration-admin.ts
// Server-only reads and the manual status change behind the Registrations screen.
// Scope is enforced here, on every function, with a filter on agent_id: an id an agent
// does not own (or one with no agent) behaves exactly like an id that does not exist.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { checkStatusChange, type ChangeableStatus } from "@/lib/landing/registration/status-rules";
import { enqueueSheetStatus, runJobsDirect, runJobsFor } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";
import { mapRecord, type RegistrationRecord } from "@/lib/data/landing-registrations";

type RegRow = Database["public"]["Tables"]["landing_registrations"]["Row"];
type ApplyArgs = Database["public"]["Functions"]["landing_apply_status"]["Args"];

export type Scope = { kind: "all"; includeTest?: boolean } | { kind: "agent"; agentId: string };
export type Actor = { userId: string; role: "admin" | "super_admin" | "sales_agent" };

export interface RegistrationListFilters {
  pageId?: string;
  status?: RegistrationStatus | "all";
  mode?: "live" | "recorded";
  agentId?: string;
  q?: string;
  page?: number;
}
export interface RegistrationListRow {
  id: string;
  refId: string | null;
  name: string;
  email: string;
  pageId: string;
  pageTitle: string;
  optionLabel: string;
  mode: "live" | "recorded";
  region: string;
  expectedAmount: number | null;
  amountReceived: number | null;
  currency: string;
  status: RegistrationStatus;
  agentId: string | null;
  agentName: string | null;
  groupSize: number;
  isTest: boolean;
  createdAt: string;
  statusChangedAt: string | null;
}
export interface RegistrationList {
  rows: RegistrationListRow[];
  total: number;
  pageSize: 25;
  counts: Record<RegistrationStatus | "all", number>;
}
export interface StatusEventRow {
  at: string;
  from: string | null;
  to: string;
  source: "app" | "sheet";
  actorName: string | null;
  registrationName: string;
}
export interface RegistrationDetail {
  lead: RegistrationRecord;
  members: RegistrationRecord[];
  page: { id: string; title: string; slug: string };
  agentName: string | null;
  events: StatusEventRow[];
}
export type ChangeStatusResult =
  | { ok: true; id: string; status: ChangeableStatus; rowsChanged: number }
  | {
      ok: false;
      reason: "not-found" | "member-row" | "free-row" | "amount-required" | "amount-invalid" | "already-in-status" | "stale" | "db-error";
    };

const PAGE_SIZE = 25 as const;
const STATUSES: RegistrationStatus[] = ["pending", "reserved", "underpaid", "paid", "free"];
const HEAD_ROW_TYPES = ["individual", "lead"];

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

/** Neutralise LIKE wildcards, then quote the value for PostgREST's or() list so a comma cannot split it. */
function searchPattern(q: string): string {
  // PostgREST rewrites * to %, so the escaped \* matches a literal percent sign: intentional, it cannot widen a search.
  const like = q.trim().replace(/[\\%_*]/g, (c) => `\\${c}`);
  const quoted = `%${like}%`.replace(/[\\"]/g, (c) => `\\${c}`);
  return `"${quoted}"`;
}

/** Fetch names for a set of profile ids. */
async function profileNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((i): i is string => typeof i === "string" && i !== "")));
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("profiles").select("id, full_name").in("id", unique);
  if (error) throw error;
  for (const p of data ?? []) out.set(p.id, p.full_name);
  return out;
}

/** Visibility rules shared by every read: agents see only their own non-test rows; admins hide test rows unless asked. */
function scopeParams(scope: Scope): { agentFilter: boolean; agentId: string; hideTest: boolean } {
  if (scope.kind === "agent") return { agentFilter: true, agentId: scope.agentId ?? "", hideTest: true };
  return { agentFilter: false, agentId: "", hideTest: !scope.includeTest };
}

/** An agent scope with no usable id must see nothing (never fall through to "every row"). */
const isEmptyAgentScope = (scope: Scope): boolean => scope.kind === "agent" && !scope.agentId;

export async function listRegistrations(scope: Scope, f: RegistrationListFilters): Promise<RegistrationList> {
  if (isEmptyAgentScope(scope)) {
    const counts = { all: 0, pending: 0, reserved: 0, underpaid: 0, paid: 0, free: 0 } as Record<RegistrationStatus | "all", number>;
    return { rows: [], total: 0, pageSize: PAGE_SIZE, counts };
  }
  const admin = createAdminSupabase();

  // Everything except the status filter, so each status tab can show its own count.
  const base = (head: boolean) => {
    let query = admin
      .from("landing_registrations")
      .select(head ? "id" : "*", head ? { count: "exact", head: true } : undefined)
      .in("row_type", HEAD_ROW_TYPES);
    const sc = scopeParams(scope);
    if (sc.agentFilter) query = query.eq("agent_id", sc.agentId);
    if (sc.hideTest) query = query.eq("is_test", false);
    if (f.pageId) query = query.eq("page_id", f.pageId);
    if (f.mode) query = query.eq("mode", f.mode);
    if (f.agentId && scope.kind === "all") query = query.eq("agent_id", f.agentId);
    const q = f.q?.trim();
    if (q) {
      const p = searchPattern(q);
      query = query.or(`name.ilike.${p},email.ilike.${p},ref_id.ilike.${p}`);
    }
    return query;
  };

  const countFor = async (status: RegistrationStatus | "all"): Promise<number> => {
    const query = base(true);
    const { count, error } = await (status === "all" ? query : query.eq("status", status));
    if (error) throw error;
    return count ?? 0;
  };

  const page = Math.max(1, Math.floor(f.page ?? 1));
  const from = (page - 1) * PAGE_SIZE;
  let rowsQuery = base(false);
  if (f.status && f.status !== "all") rowsQuery = rowsQuery.eq("status", f.status);
  const [rowsRes, all, ...perStatus] = await Promise.all([
    rowsQuery.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    countFor("all"),
    ...STATUSES.map(countFor),
  ]);
  if (rowsRes.error) throw rowsRes.error;

  const counts = { all } as Record<RegistrationStatus | "all", number>;
  STATUSES.forEach((s, i) => { counts[s] = perStatus[i]; });
  const records = (rowsRes.data ?? []) as unknown as Record<string, unknown>[];

  const pageIds = Array.from(new Set(records.map((r) => str(r.page_id)).filter(Boolean)));
  const titles = new Map<string, string>();
  if (pageIds.length > 0) {
    const { data, error } = await admin.from("landing_pages").select("id, title").in("id", pageIds);
    if (error) throw error;
    for (const p of data ?? []) titles.set(p.id, p.title);
  }
  const names = await profileNames(records.map((r) => strOrNull(r.agent_id)));

  const rows: RegistrationListRow[] = records.map((r) => ({
    id: str(r.id),
    refId: strOrNull(r.ref_id),
    name: str(r.name),
    email: str(r.email),
    pageId: str(r.page_id),
    pageTitle: titles.get(str(r.page_id)) ?? "",
    optionLabel: str(r.option_label),
    mode: r.mode === "recorded" ? "recorded" : "live",
    region: str(r.region),
    expectedAmount: numOrNull(r.expected_amount),
    amountReceived: numOrNull(r.amount_received),
    currency: str(r.currency),
    status: str(r.status) as RegistrationStatus,
    agentId: strOrNull(r.agent_id),
    agentName: names.get(str(r.agent_id)) ?? null,
    groupSize: Number(r.group_size ?? 1),
    isTest: r.is_test === true,
    createdAt: str(r.created_at),
    statusChangedAt: strOrNull(r.status_changed_at),
  }));
  const total = f.status && f.status !== "all" ? counts[f.status] : all;
  return { rows, total, pageSize: PAGE_SIZE, counts };
}

/** The lead/individual/member row for `id` if this scope may see it, else null. */
async function readScopedRow(id: string, scope: Scope): Promise<RegRow | null> {
  if (isEmptyAgentScope(scope)) return null;
  const admin = createAdminSupabase();
  const sc = scopeParams(scope);
  let query = admin.from("landing_registrations").select("*").eq("id", id);
  if (sc.agentFilter) query = query.eq("agent_id", sc.agentId);
  if (sc.hideTest) query = query.eq("is_test", false);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as RegRow | null) ?? null;
}

export async function getRegistrationDetail(id: string, scope: Scope): Promise<RegistrationDetail | null> {
  const row = await readScopedRow(id, scope);
  if (!row || (row as unknown as { row_type: string }).row_type === "member") return null;
  const admin = createAdminSupabase();
  const lead = mapRecord(row);

  const { data: memberRows, error: mErr } = await admin
    .from("landing_registrations")
    .select("*")
    .eq("lead_registration_id", lead.id)
    .order("created_at", { ascending: true });
  if (mErr) throw mErr;
  const members = (memberRows ?? []).map((m) => mapRecord(m as RegRow));

  const { data: page, error: pErr } = await admin.from("landing_pages").select("id, title, slug").eq("id", lead.pageId).maybeSingle();
  if (pErr) throw pErr;

  const people = [lead, ...members];
  const { data: evRows, error: eErr } = await admin
    .from("landing_status_events")
    .select("*")
    .in("registration_id", people.map((p) => p.id))
    .order("at", { ascending: false });
  if (eErr) throw eErr;
  const events = (evRows ?? []) as unknown as Record<string, unknown>[];

  const names = await profileNames([lead.agentId, ...events.map((e) => strOrNull(e.changed_by))]);
  const personName = new Map(people.map((p) => [p.id, p.name]));

  return {
    lead,
    members,
    page: { id: page?.id ?? lead.pageId, title: page?.title ?? "", slug: page?.slug ?? "" },
    agentName: lead.agentId ? names.get(lead.agentId) ?? null : null,
    events: events.map((e) => ({
      at: str(e.at),
      from: strOrNull(e.from_status),
      to: str(e.to_status),
      source: e.source === "sheet" ? "sheet" : "app",
      actorName: strOrNull(e.changed_by) ? names.get(str(e.changed_by)) ?? null : null,
      registrationName: personName.get(str(e.registration_id)) ?? "",
    })),
  };
}

/**
 * Manual status change. `expectedFrom` is the status the person SAW; if the row has moved on,
 * the answer is "stale" and nothing is written. The RPC re-checks that under a row lock.
 */
export async function changeRegistrationStatus(p: {
  registrationId: string;
  to: ChangeableStatus;
  expectedFrom: RegistrationStatus;
  amount?: number | null;
  actor: Actor;
}): Promise<ChangeStatusResult> {
  // Agents act only on their own rows; admins see test rows too.
  const scope: Scope = p.actor.role === "sales_agent" ? { kind: "agent", agentId: p.actor.userId } : { kind: "all", includeTest: true };
  let row: RegRow | null;
  try {
    row = await readScopedRow(p.registrationId, scope);
  } catch (e) {
    console.error("[landing-registration-admin] read failed:", (e as { code?: string })?.code);
    return { ok: false, reason: "db-error" };
  }
  if (!row) return { ok: false, reason: "not-found" };
  const rec = mapRecord(row);

  if (rec.rowType === "member") return { ok: false, reason: "member-row" };
  if (rec.status !== p.expectedFrom) return { ok: false, reason: "stale" };
  const check = checkStatusChange({
    rowType: rec.rowType,
    from: rec.status,
    to: p.to,
    expectedAmount: rec.expectedAmount,
    amount: p.amount ?? null,
  });
  if (!check.ok) return { ok: false, reason: check.reason };

  const admin = createAdminSupabase();
  const args: ApplyArgs = {
    p_registration_id: rec.id,
    p_to_status: p.to,
    p_expected_from: p.expectedFrom,
    p_amount: check.amountReceived,
    p_actor: p.actor.userId,
    p_source: "app",
  };
  const { data, error } = await admin.rpc("landing_apply_status", args);
  if (error) {
    console.error("[landing-registration-admin] change failed:", error.code);
    return { ok: false, reason: "db-error" };
  }
  const out = (data ?? {}) as { ok?: unknown; reason?: unknown; changed?: unknown };
  if (out.ok !== true) {
    if (out.reason === "stale") return { ok: false, reason: "stale" };
    if (out.reason === "not-found") return { ok: false, reason: "not-found" };
    if (out.reason === "free-row") return { ok: false, reason: "free-row" };
    if (out.reason === "already-in-status") return { ok: false, reason: "already-in-status" };
    console.warn(`[landing-registration-admin] unmapped rpc reason: ${String(out.reason)}`);
    return { ok: false, reason: "db-error" };
  }

  // Push the new status to the event sheet. A sheet problem never fails the change: the job row is
  // the durable record and the cron drain retries it.
  try {
    if (await enqueueSheetStatus(rec.id)) runInBackground(runJobsFor(rec.id));
    else runInBackground(runJobsDirect(rec.id, ["sheet_status"]));
  } catch {
    console.error("[landing-registration-admin] sheet status push crashed");
  }
  return { ok: true, id: rec.id, status: p.to, rowsChanged: Number(out.changed ?? 0) };
}
