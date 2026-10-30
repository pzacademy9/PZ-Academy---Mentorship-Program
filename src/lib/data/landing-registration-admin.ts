// src/lib/data/landing-registration-admin.ts
// Server-only reads and the manual status change behind the Registrations screen.
// Scope is enforced here, on every function, with a filter on agent_id: an id an agent
// does not own (or one with no agent) behaves exactly like an id that does not exist.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getMetaPurchase } from "@/lib/data/landing-meta-events";
import type { Database } from "@/lib/supabase/database.types";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { checkStatusChange, type ChangeableStatus } from "@/lib/landing/registration/status-rules";
import { enqueueSheetStatus, enqueueStatusEffects, runJobsDirect, runJobsFor } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";
import { mapRecord, type RegistrationRecord } from "@/lib/data/landing-registrations";
import { listEmailLog, type EmailLogKind } from "@/lib/data/landing-email-log";
import { RECEIVED_SENT, type ManualEmailKind } from "@/lib/landing/registration/manual-kinds";
import { resolveAccess } from "@/lib/data/landing-enrollment";
import { listMessagesForRegistrations } from "@/lib/data/participant-sends";
import { optionPatterns } from "@/lib/classes/audience";
import { getRegistrablePageById } from "@/lib/data/landing-public";
import { paidGroupWarning, selectWaGroups } from "@/lib/landing/registration/wa-groups";

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
  region?: string;
  optionLabel?: string;
  /** Any of these matches: "full" for the full course, or a module number. Empty or missing adds no filter. */
  optionScopes?: ("full" | number)[];
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
  /** The payment voucher link. Admin-only: always null for an agent scope. */
  voucherUrl: string | null;
  whatsapp: string;
  /** A sheet_details job for this person exists and is not done (pending, running or failed). */
  sheetUpdateWaiting: boolean;
  /** Latest time each status email (automatic or manual) went out to this person. */
  lastEmailAt: Partial<Record<ManualEmailKind, string>>;
  /** The person's permanent PZ ID, or null when they have no person yet (not paid, or free). */
  pzId?: string | null;
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
  /** Emails that went out to the lead and members, newest first. Always [] for an agent scope. */
  emails: { kind: EmailLogKind; toEmail: string; sentAt: string }[];
  /** Emails and WhatsApp messages the team sent from a campaign to the lead and members, newest first. Always [] for an agent scope. */
  messages: { registrationId: string; channel: string; subject: string; state: string; sentAt: string | null; sendCreatedAt: string | null }[];
  /** The lead's course access. `modules` is null only when there is no course or no enrollment yet; otherwise the effective module list with open flags. */
  access: RegistrationAccess;
  /** Meta Purchase status for the lead. Always "none" for an agent scope. */
  metaPurchase: { state: "sent" | "skipped_old" | "waiting" | "none"; at: string | null };
}
export interface RegistrationAccess {
  mode: "live" | "recorded";
  hasAccount: boolean;
  enrollmentStatus: string | null;
  portalOpen: boolean | null;
  /** True when the landing page has a course attached (even if this person has no enrollment yet). */
  hasCourse: boolean;
  modules: { id: string; title: string; open: boolean }[] | null;
}
export type ChangeStatusResult =
  | { ok: true; id: string; status: ChangeableStatus; rowsChanged: number; warning?: string }
  | {
      ok: false;
      reason: "not-found" | "member-row" | "free-row" | "amount-required" | "amount-invalid" | "already-in-status" | "stale" | "db-error";
    };

const PAGE_SIZE = 25 as const;
const STATUSES: RegistrationStatus[] = ["pending", "reserved", "underpaid", "paid", "free"];
export const HEAD_ROW_TYPES = ["individual", "lead"];

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

/** The head-row filters shared by the list and by campaign recipient resolution (everything except status and paging). */
export function applyHeadFilters<T extends { in: any; eq: any; or: any }>(query: T, scope: Scope, f: RegistrationListFilters): T {
  let qy: any = query.in("row_type", HEAD_ROW_TYPES);
  const sc = scopeParams(scope);
  if (sc.agentFilter) qy = qy.eq("agent_id", sc.agentId);
  if (sc.hideTest) qy = qy.eq("is_test", false);
  if (f.pageId) qy = qy.eq("page_id", f.pageId);
  if (f.mode) qy = qy.eq("mode", f.mode);
  if (f.region) qy = qy.eq("region", f.region);
  if (f.optionLabel) qy = qy.eq("option_label", f.optionLabel);
  if (f.optionScopes && f.optionScopes.length > 0) {
    // Quoted because the module patterns contain a comma, which would otherwise split the or() list.
    const entries = f.optionScopes.flatMap((s) => optionPatterns(s)).map((pat) => `option_label.ilike."${pat}"`);
    qy = qy.or(entries.join(","));
  }
  if (f.agentId && scope.kind === "all") qy = qy.eq("agent_id", f.agentId);
  const q = f.q?.trim();
  if (q) {
    const p = searchPattern(q);
    qy = qy.or(`name.ilike.${p},email.ilike.${p},ref_id.ilike.${p}`);
  }
  return qy as T;
}

const ID_CHUNK = 100;
const chunks = <T,>(xs: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += ID_CHUNK) out.push(xs.slice(i, i + ID_CHUNK));
  return out;
};
const EMAIL_LOG_TO_KIND: Record<string, ManualEmailKind> = {
  paid: "paid", manual_paid: "paid",
  underpaid: "underpaid", manual_underpaid: "underpaid",
  reserved: "reserved", manual_reserved: "reserved",
  manual_received: "received",
};

/**
 * Per-row list extras in two queries (chunked to 100 ids per .in()): which people have an unfinished
 * sheet_details job, and the latest sent time per status email kind. An automatic Received has no log
 * row; it counts through email_status, dated at createdAt (same fallback as sendStatusEmailAgain).
 */
export async function loadRowExtras(
  people: { id: string; createdAt: string; emailStatus: string | null }[],
  opts: { includeEmails?: boolean } = {},
): Promise<{ waiting: Set<string>; lastEmail: Map<string, Partial<Record<ManualEmailKind, string>>> }> {
  const admin = createAdminSupabase();
  const waiting = new Set<string>();
  const lastEmail = new Map<string, Partial<Record<ManualEmailKind, string>>>();
  const includeEmails = opts.includeEmails !== false;
  for (const p of people) if (includeEmails && p.emailStatus === RECEIVED_SENT) lastEmail.set(p.id, { received: p.createdAt });
  const ids = people.map((p) => p.id);
  for (const part of chunks(ids)) {
    const [jobs, logs] = await Promise.all([
      admin.from("landing_jobs").select("registration_id").eq("type", "sheet_details").neq("status", "done").in("registration_id", part),
      !includeEmails ? Promise.resolve({ data: [] as { registration_id: string; kind: string; sent_at: string | null }[], error: null }) : admin.from("landing_email_log").select("registration_id, kind, sent_at").eq("state", "sent").in("kind", Object.keys(EMAIL_LOG_TO_KIND)).in("registration_id", part).order("sent_at", { ascending: false }),
    ]);
    // Extras are decoration: a failed lookup must not break the whole list, so it degrades to empty.
    if (jobs.error) console.error("[landing-registration-admin] waiting-jobs lookup failed:", jobs.error.code ?? "unknown");
    if (logs.error) console.error("[landing-registration-admin] email-log lookup failed:", logs.error.code ?? "unknown");
    for (const j of jobs.error ? [] : jobs.data ?? []) waiting.add(j.registration_id as string);
    for (const l of logs.error ? [] : logs.data ?? []) {
      const kind = EMAIL_LOG_TO_KIND[l.kind as string];
      const at = l.sent_at as string | null;
      if (!kind || !at) continue;
      const cur = lastEmail.get(l.registration_id as string) ?? {};
      if (!cur[kind] || Date.parse(at) > Date.parse(cur[kind] as string)) cur[kind] = at;
      lastEmail.set(l.registration_id as string, cur);
    }
  }
  return { waiting, lastEmail };
}

export async function listRegistrations(scope: Scope, f: RegistrationListFilters): Promise<RegistrationList> {
  if (isEmptyAgentScope(scope)) {
    const counts = { all: 0, pending: 0, reserved: 0, underpaid: 0, paid: 0, free: 0 } as Record<RegistrationStatus | "all", number>;
    return { rows: [], total: 0, pageSize: PAGE_SIZE, counts };
  }
  const admin = createAdminSupabase();

  // Everything except the status filter, so each status tab can show its own count.
  const base = (head: boolean) => applyHeadFilters(
    admin.from("landing_registrations").select(head ? "id" : "*", head ? { count: "exact", head: true } : undefined),
    scope,
    f,
  );

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

  const extras = await loadRowExtras(records.map((r) => ({ id: str(r.id), createdAt: str(r.created_at), emailStatus: strOrNull(r.email_status) })), { includeEmails: scope.kind !== "agent" });
  const isAgent = scope.kind === "agent";

  const personIds = Array.from(new Set(records.map((r) => strOrNull(r.person_id)).filter((v): v is string => v !== null)));
  const pzIds = new Map<string, string>();
  if (personIds.length > 0) {
    const { data, error } = await admin.from("pz_people").select("id, pz_id").in("id", personIds);
    if (error) throw error;
    for (const p of data ?? []) pzIds.set(p.id, p.pz_id);
  }

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
    voucherUrl: isAgent ? null : strOrNull(r.voucher_url),
    whatsapp: str(r.whatsapp),
    sheetUpdateWaiting: extras.waiting.has(str(r.id)),
    lastEmailAt: extras.lastEmail.get(str(r.id)) ?? {},
    pzId: pzIds.get(str(r.person_id)) ?? null,
  }));
  const total = f.status && f.status !== "all" ? counts[f.status] : all;
  return { rows, total, pageSize: PAGE_SIZE, counts };
}

/** Page choices for the admin filter: every landing page, by title. */
export async function listRegistrationPageOptions(): Promise<{ id: string; title: string }[]> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("id, title").order("title", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, title: p.title }));
}

/** The public URL slug of a landing page, or null when the page does not exist or is not published or closed. */
export async function getRegistrationPageSlug(pageId: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("slug, status").eq("id", pageId).maybeSingle();
  if (error) throw error;
  if (!data || (data.status !== "published" && data.status !== "closed")) return null;
  return data.slug ?? null;
}

/** Agent choices for the admin filter: every sales agent, by name. */
export async function listRegistrationAgentOptions(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createAdminSupabase()
    .from("profiles")
    .select("id, full_name")
    .eq("role", "sales_agent")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
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

/** The lead's own enrollment shape for this page's course. Admin client, keyed by the lead's student id only. */
async function readAccess(lead: RegistrationRecord): Promise<RegistrationAccess> {
  const resolved = await resolveAccess(lead.id);
  const base: RegistrationAccess = {
    mode: resolved?.lead.mode ?? lead.mode,
    hasAccount: resolved ? resolved.hasAccount : lead.studentId !== null,
    enrollmentStatus: null,
    portalOpen: null,
    hasCourse: (resolved?.courseId ?? null) !== null,
    modules: null,
  };
  const courseId = resolved?.courseId ?? null;
  if (!courseId || !lead.studentId) return base;

  const admin = createAdminSupabase();
  const { data: enr, error: eErr } = await admin
    .from("enrollments")
    .select("id, status, portal_open, access_level")
    .eq("student_id", lead.studentId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (eErr) throw eErr;
  if (!enr) return base;
  const e = enr as { id: string; status: string; portal_open: boolean; access_level: string | null };

  const [coveredRes, openRes, modsRes] = await Promise.all([
    admin.from("enrollment_modules").select("module_id").eq("enrollment_id", e.id),
    admin.from("enrollment_open_modules").select("module_id").eq("enrollment_id", e.id),
    admin.from("modules").select("id, title, order_index").eq("course_id", courseId).order("order_index", { ascending: true }),
  ]);
  if (coveredRes.error) throw coveredRes.error;
  if (openRes.error) throw openRes.error;
  if (modsRes.error) throw modsRes.error;
  const covered = new Set((coveredRes.data ?? []).map((r) => r.module_id as string));
  const opened = new Set((openRes.data ?? []).map((r) => r.module_id as string));
  const live = e.access_level === "live";
  const activeOpen = e.status === "active" && e.portal_open === true;
  const mods = modsRes.data ?? []; // already in course order from the query
  const effective = covered.size === 0 ? mods : mods.filter((m) => covered.has(m.id));
  return {
    ...base,
    enrollmentStatus: e.status,
    portalOpen: e.portal_open,
    modules: effective.map((m) => ({ id: m.id, title: m.title, open: activeOpen && (!live || opened.has(m.id)) })),
  };
}

const NO_META: RegistrationDetail["metaPurchase"] = { state: "none", at: null };

async function readMetaPurchase(lead: RegistrationRecord): Promise<RegistrationDetail["metaPurchase"]> {
  const row = await getMetaPurchase(lead.id);
  // No row is always "none": rows Paid before this feature shipped have no row and no job, so they would wait forever.
  if (!row) return NO_META;
  if (row.state === "sent") return { state: "sent", at: row.sentAt };
  if (row.state === "skipped_old") return { state: "skipped_old", at: null };
  return { state: "waiting", at: null }; // 'claimed'
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

  const emails = scope.kind === "agent"
    ? []
    : (await listEmailLog(people.map((p) => p.id)))
        .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
        .map((m) => ({ kind: m.kind, toEmail: m.toEmail, sentAt: m.sentAt }));
  const messages = scope.kind === "agent" ? [] : await listMessagesForRegistrations(people.map((p) => p.id));
  const access = await readAccess(lead);
  const metaPurchase = scope.kind === "agent" ? NO_META : await readMetaPurchase(lead);

  return {
    lead,
    members,
    emails,
    messages,
    access,
    metaPurchase,
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

  await queueStatusFollowUps(rec.id);
  const warning = await lookupPaidWarning(rec, p.to);
  return { ok: true, id: rec.id, status: p.to, rowsChanged: Number(out.changed ?? 0), ...(warning ? { warning } : {}) };
}

/** Read-only check for the Paid-without-group-link warning. A failed lookup yields no warning, never a failed change. */
async function lookupPaidWarning(rec: RegistrationRecord, to: ChangeableStatus): Promise<string | null> {
  if (to !== "paid" || rec.mode !== "live") return null;
  try {
    const page = await getRegistrablePageById(rec.pageId);
    if (!page) return null;
    return paidGroupWarning({ to, mode: rec.mode, groups: selectWaGroups(page.registration, rec.optionKeys, rec.mode) });
  } catch {
    return null;
  }
}

/**
 * Push the new status to the event sheet and queue enrollment/email. A problem here never fails the change: the job row is
 * the durable record and the cron drain retries it.
 */
export async function queueStatusFollowUps(registrationId: string): Promise<void> {
  try {
    // The sheet push and the enrollment/email jobs are independent groups: each is enqueued on its
    // own, the outbox drain runs whichever enqueued, and a group that failed to enqueue runs directly.
    const sheetQueued = await enqueueSheetStatus(registrationId).catch(() => false);
    const effectsQueued = await enqueueStatusEffects(registrationId).catch(() => false);
    if (sheetQueued || effectsQueued) runInBackground(runJobsFor(registrationId));
    if (!sheetQueued) runInBackground(runJobsDirect(registrationId, ["sheet_status"]));
    if (!effectsQueued) runInBackground(runJobsDirect(registrationId, ["enrollment_sync", "email_status", "meta_purchase"]));
  } catch {
    console.error("[landing-registration-admin] sheet status push crashed");
  }
}
