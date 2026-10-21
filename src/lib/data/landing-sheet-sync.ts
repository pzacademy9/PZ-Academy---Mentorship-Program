import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { checkStatusChange, type ChangeableStatus } from "@/lib/landing/registration/status-rules";
import { parseSheetStatus, planScan, type SyncField, type PlannedChange, type PlanResult, type SheetScanRow, type AppReg, type Snapshot } from "@/lib/landing/registration/sheet-sync-engine";
import { enqueueSheetStatus, runJobsFor } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";
import { mapRecord } from "@/lib/data/landing-registrations";
import { queueStatusFollowUps } from "@/lib/data/landing-registration-admin";

type RegRow = Database["public"]["Tables"]["landing_registrations"]["Row"];
type ApplyArgs = Database["public"]["Functions"]["landing_apply_status"]["Args"];

export interface SnapshotInput { id: string; status: RegistrationStatus; amountReceived: number | null; name: string; email: string; whatsapp: string }
export interface StatusSnapshotInput { id: string; status: RegistrationStatus; amountReceived: number | null }

/**
 * Remembers what the app last wrote to each sheet row. Values are stored in the form the planner
 * compares with (email lower+trim, WhatsApp digits only, name trimmed). Throws on a database error.
 */
export async function saveSnapshots(regs: SnapshotInput[], opts: { insertOnly?: boolean } = {}): Promise<void> {
  if (regs.length === 0) return;
  const now = new Date().toISOString();
  const rows = regs.map((r) => ({
    registration_id: r.id,
    status: r.status,
    amount_received: r.amountReceived,
    name: r.name.trim(),
    email: r.email.trim().toLowerCase(),
    whatsapp: r.whatsapp.replace(/\D/g, ""),
    updated_at: now,
  }));
  const { error } = await createAdminSupabase().from("landing_sheet_snapshots").upsert(rows, opts.insertOnly ? { onConflict: "registration_id", ignoreDuplicates: true } : { onConflict: "registration_id" });
  if (error) throw new Error(error.message);
}

/**
 * After a status push: updates ONLY status and amount of snapshots that already exist, so the stored
 * name/email/WhatsApp stay as last written. Registrations without a snapshot are skipped (they get
 * one at their first approved scan). Throws on a database error.
 */
export async function saveStatusSnapshots(regs: StatusSnapshotInput[]): Promise<void> {
  const now = new Date().toISOString();
  const db = createAdminSupabase();
  for (const r of regs) {
    const { error } = await db
      .from("landing_sheet_snapshots")
      .update({ status: r.status, amount_received: r.amountReceived, updated_at: now })
      .eq("registration_id", r.id);
    if (error) throw new Error(error.message);
  }
}

export type ApplyOutcome = { change: PlannedChange; outcome: "applied" | "skipped" | "rejected"; detail: string };

const LOG = "[landing-sheet-sync]";

/** Sets the remembered sheet value for one registration; no snapshot row means nothing to update. Never throws. */
async function updateSnapshot(registrationId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_sheet_snapshots")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("registration_id", registrationId);
  if (error) console.error(`${LOG} snapshot update failed:`, (error as { code?: string }).code);
}

const STATUS_REJECTIONS: Record<string, string> = {
  "free-row": "Free registrations have no payment, so their status cannot be changed",
  "member-row": "This person is part of a group; change the status on the group's main registration",
  "amount-required": "An amount received is needed for this status",
  "amount-invalid": "The amount received is not valid for this status",
};

/**
 * Applies planned sheet edits. Status changes go through the same guarded path as the app (checkStatusChange, then the
 * landing_apply_status function with no actor and source "sheet"); a status change's paired amount change travels with it.
 * Returns one outcome per input change. Never throws on a per-row problem.
 */
export async function applySheetChanges(pageId: string, changes: PlannedChange[]): Promise<ApplyOutcome[]> {
  const out: ApplyOutcome[] = [];
  const hasStatus = new Set(changes.filter((c) => c.field === "status").map((c) => c.registrationId));
  const db = createAdminSupabase();

  for (const change of changes) {
    const done = (outcome: ApplyOutcome["outcome"], detail: string) => out.push({ change, outcome, detail });
    try {
      // Paired with a status change in this batch: it travels with the status change and shares its outcome.
      if (change.field === "amount" && hasStatus.has(change.registrationId)) {
        const statusOutcome = out.find((o) => o.change.registrationId === change.registrationId && o.change.field === "status");
        done(statusOutcome?.outcome ?? "skipped", "Amount handled together with the status change");
        continue;
      }

      const { data, error } = await db.from("landing_registrations").select("*").eq("id", change.registrationId).maybeSingle();
      if (error) { console.error(`${LOG} read failed:`, error.code); done("rejected", "Could not read this registration; try again"); continue; }
      if (!data) { done("rejected", "This registration no longer exists"); continue; }
      const rec = mapRecord(data as RegRow);

      // The plan was built against change.appValue: if the app moved on since then, the old sheet value must not win.
      const current: Record<PlannedChange["field"], string | number | null> = {
        status: rec.status,
        amount: rec.amountReceived,
        name: rec.name.trim(),
        whatsapp: rec.whatsapp.replace(/\D/g, ""),
        email: rec.email.trim().toLowerCase(),
      };
      const planned = typeof change.appValue === "string"
        ? (change.field === "name" ? change.appValue.trim()
          : change.field === "whatsapp" ? change.appValue.replace(/\D/g, "")
          : change.field === "email" ? change.appValue.trim().toLowerCase()
          : change.appValue)
        : change.appValue;
      if (current[change.field] !== planned) { done("skipped", "Changed in the app since the sheet was checked"); continue; }

      if (change.field === "status") {
        const to = typeof change.sheetValue === "string" ? parseSheetStatus(change.sheetValue) : null;
        if (to === null || to === "free") { done("rejected", "That status is not one the app can set"); continue; }
        const paired = changes.find((c) => c.registrationId === change.registrationId && c.field === "amount");
        const pairedAmount = paired && typeof paired.sheetValue === "number" ? paired.sheetValue : null;
        const check = checkStatusChange({ rowType: rec.rowType, from: rec.status, to: to as ChangeableStatus, expectedAmount: rec.expectedAmount, amount: pairedAmount });
        if (!check.ok) {
          if (check.reason === "already-in-status") done("skipped", "Already in that status");
          else done("rejected", STATUS_REJECTIONS[check.reason] ?? "Not allowed");
          continue;
        }
        const args: ApplyArgs = {
          p_registration_id: rec.id,
          p_to_status: to,
          p_expected_from: rec.status, // equals the planned status (checked above)
          p_amount: check.amountReceived,
          p_actor: null,
          p_source: "sheet",
        };
        const { data: res, error: rpcErr } = await db.rpc("landing_apply_status", args);
        if (rpcErr) { console.error(`${LOG} status change failed:`, rpcErr.code); done("rejected", "Could not save this status change; try again"); continue; }
        const r = (res ?? {}) as { ok?: unknown; reason?: unknown };
        if (r.ok !== true) {
          if (r.reason === "stale" || r.reason === "already-in-status") done("skipped", "The status had already changed");
          else if (r.reason === "free-row") done("rejected", STATUS_REJECTIONS["free-row"]);
          else if (r.reason === "not-found") done("rejected", "This registration no longer exists");
          else { console.warn(`${LOG} unmapped rpc reason: ${String(r.reason)}`); done("rejected", "Could not save this status change"); }
          continue;
        }
        // Snapshot first: the sheet push started by the follow-ups writes its own snapshot and must not be overwritten.
        await updateSnapshot(rec.id, { status: to, amount_received: paired ? pairedAmount : check.amountReceived });
        await queueStatusFollowUps(rec.id);
        done("applied", "Status updated");
        continue;
      }

      if (change.field === "amount") {
        if (rec.rowType === "member") { done("rejected", STATUS_REJECTIONS["member-row"]); continue; }
        if (rec.status !== "paid" && rec.status !== "underpaid") { done("rejected", "An amount can only be changed on a paid or underpaid registration"); continue; }
        const n = change.sheetValue;
        if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) { done("rejected", "The amount received must be more than 0"); continue; }
        if (rec.status === "underpaid" && rec.expectedAmount !== null && n >= rec.expectedAmount) { done("rejected", "An underpaid amount must be less than the full price"); continue; }
        const { error: uErr } = await db.from("landing_registrations").update({ amount_received: n }).eq("id", rec.id).eq("status", rec.status);
        if (uErr) { console.error(`${LOG} amount update failed:`, uErr.code); done("rejected", "Could not save the amount; try again"); continue; }
        await updateSnapshot(rec.id, { amount_received: n });
        done("applied", "Amount updated");
        continue;
      }

      if (change.field === "name" || change.field === "whatsapp") {
        const raw = typeof change.sheetValue === "string" ? change.sheetValue : "";
        const value = change.field === "name" ? raw.trim() : raw.replace(/\D/g, "");
        if (value === "") { done("rejected", `The ${change.field === "name" ? "name" : "WhatsApp number"} cannot be empty`); continue; }
        const { error: uErr } = await db.from("landing_registrations").update(change.field === "name" ? { name: value } : { whatsapp: value }).eq("id", rec.id);
        if (uErr) { console.error(`${LOG} update failed:`, uErr.code); done("rejected", "Could not save this change; try again"); continue; }
        await updateSnapshot(rec.id, { [change.field]: value });
        done("applied", change.field === "name" ? "Name updated" : "WhatsApp number updated");
        continue;
      }

      // email
      const email = (typeof change.sheetValue === "string" ? change.sheetValue : "").trim().toLowerCase();
      if (email.indexOf("@") < 1) { done("rejected", "That is not a valid email address"); continue; }
      const likeSafe = email.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: taken, error: tErr } = await db
        .from("landing_registrations").select("id").eq("page_id", pageId).neq("id", rec.id).ilike("email", likeSafe).limit(1);
      if (tErr) { console.error(`${LOG} email check failed:`, tErr.code); done("rejected", "Could not check this email; try again"); continue; }
      if ((taken ?? []).length > 0) { done("rejected", "Another person on this page already uses that email"); continue; }
      const { error: uErr } = await db.from("landing_registrations").update({ email }).eq("id", rec.id);
      if (uErr) { console.error(`${LOG} update failed:`, uErr.code); done("rejected", "Could not save this change; try again"); continue; }
      await updateSnapshot(rec.id, { email });
      done("applied", "Email changed; account link unchanged");
    } catch (e) {
      console.error(`${LOG} apply crashed:`, (e as { code?: string })?.code);
      done("rejected", "Something went wrong applying this change");
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Scan: receives the sheet's rows, plans, applies (live) or only reports (report), and logs.
// ---------------------------------------------------------------------------------------------

type LogInsert = Database["public"]["Tables"]["landing_sheet_sync_log"]["Insert"];
type SyncState = "report" | "live";

export interface ScanSummary { applied: number; rejected: number; skipped: number; unknown: number; duplicates: number; differences: number }

/** Sheets to scan, oldest scan first (never scanned first). */
export async function listSheetsToScan(): Promise<{ sheetId: string; pageId: string; state: SyncState }[]> {
  const { data, error } = await createAdminSupabase()
    .from("landing_pages")
    .select("id, sheet_id, sheet_sync_state, sheet_last_scanned_at")
    .neq("sheet_id", "")
    .order("sheet_last_scanned_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((p) => typeof p.sheet_id === "string" && p.sheet_id !== "")
    .map((p) => ({ sheetId: p.sheet_id as string, pageId: p.id, state: (p.sheet_sync_state === "live" ? "live" : "report") as SyncState }));
}

const CHUNK = 1000;
/** Ids per `.in()` filter: keeps the request URL short. */
const ID_CHUNK = 100;

/** Every registration of one page (leads, members, individuals), read in chunks of 1000. */
async function loadPageRegistrations(pageId: string): Promise<RegRow[]> {
  const db = createAdminSupabase();
  const all: RegRow[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await db
      .from("landing_registrations").select("*").eq("page_id", pageId)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RegRow[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return all;
}

async function loadSnapshots(regIds: string[]): Promise<Snapshot[]> {
  const db = createAdminSupabase();
  const out: Snapshot[] = [];
  for (let i = 0; i < regIds.length; i += ID_CHUNK) {
    const { data, error } = await db.from("landing_sheet_snapshots").select("*").in("registration_id", regIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const s of data ?? []) {
      out.push({
        registrationId: s.registration_id,
        status: (s.status ?? "pending") as RegistrationStatus,
        amountReceived: s.amount_received === null || s.amount_received === undefined ? null : Number(s.amount_received),
        name: s.name ?? "", email: s.email ?? "", whatsapp: s.whatsapp ?? "",
      });
    }
  }
  return out;
}

const REJECT_WORDS: Record<string, string> = {
  "bad-status": "The status in the sheet is not one the app can set",
  "bad-amount": "The amount in the sheet is not valid",
  "member-status": "This person is part of a group; change the status on the group's main registration",
  "free-row": "Free registrations have no payment, so their status cannot be changed",
  "test-row": "Test registrations are ignored",
  "bad-email": "The email in the sheet is not valid or is already used on this page",
  "bad-name": "The name in the sheet is empty or too long",
  "bad-whatsapp": "The WhatsApp number in the sheet is not a valid number",
  "amount-required": "An amount is needed for this status",
};

const asText = (v: string | number | null | undefined): string | null => (v === null || v === undefined ? null : String(v));

/**
 * Handles one sheet scan. Report mode only records what it would change. Live mode applies the
 * sheet's edits and queues a sheet rewrite where the app's value won. Every decision is logged
 * under one scan id. Throws on a database error before anything is applied.
 */
export async function runScan(sheetId: string, rows: SheetScanRow[]): Promise<ScanSummary | { error: "unknown-sheet" }> {
  const db = createAdminSupabase();
  const { data: page, error: pErr } = await db
    .from("landing_pages").select("id, sheet_sync_state").eq("sheet_id", sheetId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!page) return { error: "unknown-sheet" };
  const pageId = page.id as string;
  const mode: SyncState = page.sheet_sync_state === "live" ? "live" : "report";

  const records = await loadPageRegistrations(pageId);
  const refById = new Map(records.map((r) => [r.id, r.ref_id ?? ""]));
  const regs: AppReg[] = records.map((r) => {
    const m = mapRecord(r);
    return {
      id: m.id,
      refId: m.refId,
      leadRefId: m.rowType === "member" ? (m.leadRegistrationId ? refById.get(m.leadRegistrationId) ?? "" : "") : (m.refId ?? ""),
      rowType: m.rowType,
      name: m.name, email: m.email, whatsapp: m.whatsapp,
      status: m.status, amountReceived: m.amountReceived,
      expectedAmount: m.expectedAmount ?? 0,
      isTest: m.isTest,
    };
  });
  const snapshots = mode === "live" ? await loadSnapshots(regs.map((r) => r.id)) : [];
  const plan: PlanResult = planScan(rows, regs, snapshots, mode);

  // Where a planned item came from in the sheet, for the log.
  const regById = new Map(regs.map((r) => [r.id, r]));
  const rowByKey = new Map(rows.map((r) => [`${r.refId.trim().toUpperCase()}|${r.email.trim().toLowerCase()}`, r]));
  const where = (registrationId: string) => {
    const reg = regById.get(registrationId);
    const row = reg ? rowByKey.get(`${reg.leadRefId.trim().toUpperCase()}|${reg.email.trim().toLowerCase()}`) : undefined;
    return { ref_id: reg?.leadRefId ?? "", row_number: row?.rowNumber ?? null };
  };

  const scanId = crypto.randomUUID();
  const logRows: LogInsert[] = [];
  const add = (l: Omit<LogInsert, "page_id" | "scan_id">) => logRows.push({ ...l, page_id: pageId, scan_id: scanId });

  const summary: ScanSummary = { applied: 0, rejected: 0, skipped: 0, unknown: 0, duplicates: 0, differences: 0 };

  if (mode === "report") {
    const { error } = await db.from("landing_sheet_sync_log").delete().eq("page_id", pageId).eq("outcome", "report");
    if (error) throw new Error(error.message);
    for (const c of plan.changes) {
      add({ registration_id: c.registrationId, ...where(c.registrationId), field: c.field, outcome: "report", sheet_value: asText(c.sheetValue), app_value: asText(c.appValue), detail: "Would change the app to match the sheet" });
    }
    summary.differences = plan.changes.length;
  } else {
    const outcomes = await applySheetChanges(pageId, plan.changes);
    for (const o of outcomes) {
      add({ registration_id: o.change.registrationId, ...where(o.change.registrationId), field: o.change.field, outcome: o.outcome, sheet_value: asText(o.change.sheetValue), app_value: asText(o.change.appValue), detail: o.detail });
      if (o.outcome === "applied") summary.applied++;
      else if (o.outcome === "skipped") summary.skipped++;
      else summary.rejected++;
    }
    const queued = new Set<string>();
    for (const w of plan.appWins) {
      const sheetRewrite = w.field === "status" || w.field === "amount";
      add({
        registration_id: w.registrationId, ...where(w.registrationId), field: w.field, outcome: "skipped",
        detail: sheetRewrite ? "Changed in the app since the last sync; the sheet will be updated to match" : "Changed in the app since the last sync; the app value was kept",
      });
      summary.skipped++;
      if (sheetRewrite && !queued.has(w.registrationId)) {
        queued.add(w.registrationId);
        try { await enqueueSheetStatus(w.registrationId); } catch { /* the sheet is re-checked on the next scan */ }
      }
    }
  }

  for (const r of plan.rejected) {
    add({ registration_id: r.registrationId, ref_id: where(r.registrationId).ref_id, row_number: r.rowNumber, field: r.field, outcome: "rejected", sheet_value: r.sheetValue, detail: REJECT_WORDS[r.reason] ?? "Not allowed" });
    summary.rejected++;
  }
  for (const r of plan.unknownRows) {
    add({ row_number: r.rowNumber, ref_id: r.refId, field: "row", outcome: "unknown-row", detail: "This row does not match any registration on the page" });
    summary.unknown++;
  }
  for (const r of plan.duplicateRows) {
    add({ row_number: r.rowNumber, ref_id: r.refId, field: "row", outcome: "duplicate-row", detail: "Another row in the sheet has the same Ref ID and email; this one was ignored" });
    summary.duplicates++;
  }

  // Only the latest problems stay: earlier unresolved rows are replaced by this scan's. Applied history is kept.
  const { error: dErr } = await db.from("landing_sheet_sync_log").delete().eq("page_id", pageId)
    .in("outcome", ["rejected", "unknown-row", "duplicate-row", "skipped"]);
  if (dErr) throw new Error(dErr.message);

  for (let i = 0; i < logRows.length; i += CHUNK) {
    const { error } = await db.from("landing_sheet_sync_log").insert(logRows.slice(i, i + CHUNK));
    if (error) console.error(`${LOG} log write failed:`, (error as { code?: string }).code);
  }

  const waiting = summary.rejected + summary.unknown + summary.duplicates + summary.differences;
  const { error: uErr } = await db
    .from("landing_pages")
    .update({ sheet_last_scanned_at: new Date().toISOString(), sheet_sync_waiting: waiting })
    .eq("id", pageId);
  if (uErr) console.error(`${LOG} page update failed:`, (uErr as { code?: string }).code);
  return summary;
}

// ---------------------------------------------------------------------------------------------
// First-scan review: what the owner sees, and approving it.
// ---------------------------------------------------------------------------------------------

export interface SheetSyncStatus {
  pageId: string;
  state: SyncState;
  lastScannedAt: string | null;
  waiting: number;
  report: { logId: string; registrationId: string; name: string; field: SyncField; sheetValue: string; appValue: string }[];
  problems: { rowNumber: number | null; refId: string; field: string; outcome: string; detail: string }[];
}

const SYNC_FIELDS: readonly string[] = ["status", "amount", "name", "email", "whatsapp"];
const isSyncField = (f: string): f is SyncField => SYNC_FIELDS.includes(f);

/** Raised when an approval cannot go ahead; the message is safe to show to the owner. */
export class ApproveRefused extends Error {}

type LogRow = Database["public"]["Tables"]["landing_sheet_sync_log"]["Row"];
type ReportRow = LogRow & { registration_id: string; field: SyncField };

async function loadReportRows(pageId: string): Promise<ReportRow[]> {
  const db = createAdminSupabase();
  const all: LogRow[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await db
      .from("landing_sheet_sync_log").select("*").eq("page_id", pageId).eq("outcome", "report")
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as LogRow[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return all.filter((r): r is ReportRow => r.registration_id !== null && isSyncField(r.field));
}

/** What the review screen shows for one page: the first-scan differences and the latest problems. */
export async function getSheetSyncStatus(pageId: string): Promise<SheetSyncStatus> {
  const db = createAdminSupabase();
  const { data: page, error: pErr } = await db
    .from("landing_pages").select("id, sheet_sync_state, sheet_last_scanned_at, sheet_sync_waiting").eq("id", pageId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!page) throw new Error("Page not found");
  const state: SyncState = page.sheet_sync_state === "live" ? "live" : "report";

  const reportRows = state === "report" ? await loadReportRows(pageId) : [];
  const names = new Map<string, string>();
  const ids = Array.from(new Set(reportRows.map((r) => r.registration_id)));
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await db.from("landing_registrations").select("id, name").in("id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) names.set(r.id as string, (r.name as string) ?? "");
  }

  const { data: probs, error: prErr } = await db
    .from("landing_sheet_sync_log").select("*").eq("page_id", pageId)
    .in("outcome", ["rejected", "unknown-row", "duplicate-row"])
    .order("row_number", { ascending: true }).limit(500);
  if (prErr) throw new Error(prErr.message);

  return {
    pageId,
    state,
    lastScannedAt: (page.sheet_last_scanned_at as string | null) ?? null,
    waiting: Number(page.sheet_sync_waiting ?? 0),
    report: reportRows.map((r) => ({
      logId: r.id,
      registrationId: r.registration_id,
      name: names.get(r.registration_id) ?? "",
      field: r.field,
      sheetValue: r.sheet_value ?? "",
      appValue: r.app_value ?? "",
    })),
    problems: ((probs ?? []) as LogRow[]).map((r) => ({ rowNumber: r.row_number, refId: r.ref_id, field: r.field, outcome: r.outcome, detail: r.detail })),
  };
}

const normField = (field: SyncField, v: string): string =>
  field === "whatsapp" ? v.replace(/\D/g, "") : field === "email" ? v.trim().toLowerCase() : v.trim();

/** The log stores values as text: turn them back into what the planner produced. */
function toTyped(field: SyncField, v: string | null): string | number | null {
  if (field === "amount") return v === null || v === "" ? null : Number(v);
  return v === null ? "" : v;
}

/**
 * Approves the first scan of a page. Ticked differences (by registration + field) are applied from the sheet;
 * the rest keep the app's values (status/amount: the sheet is rewritten; name/email/WhatsApp: both sides stay and
 * the sheet's value is remembered so the next scan sees no difference). The page goes live LAST, so a failure part
 * way leaves it in review and the approval can simply be repeated.
 */
export async function approveReport(
  pageId: string,
  applyKeys: { registrationId: string; field: SyncField }[],
): Promise<{ applied: number; keptApp: number }> {
  const db = createAdminSupabase();
  const { data: page, error: pErr } = await db.from("landing_pages").select("id, sheet_sync_state").eq("id", pageId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!page) throw new ApproveRefused("Page not found.");
  if (page.sheet_sync_state === "live") throw new ApproveRefused("This page's sheet is already being kept in sync. There is nothing left to approve.");

  const report = await loadReportRows(pageId);
  const ticked = new Set(applyKeys.map((k) => `${k.registrationId}|${k.field}`));
  const isTicked = (r: ReportRow) => ticked.has(`${r.registration_id}|${r.field}`);

  // 1. Every registration gets a remembered sheet state (from the app's values) if it has none, so later updates have a row to change.
  const records = await loadPageRegistrations(pageId);
  const existing = new Set<string>();
  const allIds = records.map((r) => r.id);
  for (let i = 0; i < allIds.length; i += ID_CHUNK) {
    const { data, error } = await db.from("landing_sheet_snapshots").select("registration_id").in("registration_id", allIds.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const s of data ?? []) existing.add(s.registration_id as string);
  }
  const missing: SnapshotInput[] = records.filter((r) => !existing.has(r.id)).map((r) => {
    const m = mapRecord(r);
    return { id: m.id, status: m.status, amountReceived: m.amountReceived, name: m.name, email: m.email, whatsapp: m.whatsapp };
  });
  // Insert-only: a second approval running at the same time must never overwrite a value the first one set.
  for (let i = 0; i < missing.length; i += CHUNK) await saveSnapshots(missing.slice(i, i + CHUNK), { insertOnly: true });

  // 2. Build the changes to apply. A ticked status brings its amount row along; an amount alone is an amount-only edit.
  const byReg = new Map<string, ReportRow[]>();
  for (const r of report) byReg.set(r.registration_id, [...(byReg.get(r.registration_id) ?? []), r]);
  const changes: PlannedChange[] = [];
  const toPush = new Map<string, { status?: string; amount_received?: number | null }>();
  const push = (regId: string, patch: { status?: string; amount_received?: number | null }) => toPush.set(regId, { ...(toPush.get(regId) ?? {}), ...patch });
  const keptContact: { registrationId: string; field: SyncField; sheetValue: string }[] = [];
  for (const [regId, rows] of Array.from(byReg.entries())) {
    const statusRow = rows.find((r) => r.field === "status");
    const statusTicked = statusRow !== undefined && isTicked(statusRow);
    for (const r of rows) {
      const change: PlannedChange = { registrationId: regId, field: r.field, sheetValue: toTyped(r.field, r.sheet_value), appValue: toTyped(r.field, r.app_value) };
      if (r.field === "status") {
        if (statusTicked) changes.push(change); else push(regId, { status: r.sheet_value ?? "" });
      } else if (r.field === "amount") {
        if (statusTicked || isTicked(r)) changes.push(change); else push(regId, { amount_received: toTyped("amount", r.sheet_value) as number | null });
      } else if (isTicked(r)) {
        changes.push(change);
      } else {
        keptContact.push({ registrationId: regId, field: r.field, sheetValue: normField(r.field, r.sheet_value ?? "") });
      }
    }
  }

  // 3. Apply the ticked changes.
  const outcomes = changes.length > 0 ? await applySheetChanges(pageId, changes) : [];
  const pairedAmount = (o: ApplyOutcome) => o.change.field === "amount" && changes.some((c) => c.registrationId === o.change.registrationId && c.field === "status");
  const applied = outcomes.filter((o) => o.outcome === "applied" && !pairedAmount(o)).length;

  // 4. Unticked status/amount: the app's value stays and the sheet is rewritten to it by a queued job. Until that lands the
  // sheet still shows its own value, so remember THAT value; otherwise the next scan would take it for a fresh edit and apply it.
  // The job later resets the remembered value to the app's once the sheet has been rewritten.
  const now = new Date().toISOString();
  for (const [regId, patch] of Array.from(toPush.entries())) {
    const { error } = await db.from("landing_sheet_snapshots").update({ ...patch, updated_at: now }).eq("registration_id", regId);
    if (error) throw new Error(error.message);
    if (!(await enqueueSheetStatus(regId))) throw new Error("Could not queue the sheet update; try again");
  }

  // 5. Unticked name/email/WhatsApp: both sides stay; remember the sheet's value so it is not seen as a change again.
  for (const k of keptContact) {
    const { error } = await db.from("landing_sheet_snapshots").update({ ...(k.field === "name" ? { name: k.sheetValue } : k.field === "email" ? { email: k.sheetValue } : { whatsapp: k.sheetValue }), updated_at: now }).eq("registration_id", k.registrationId);
    if (error) throw new Error(error.message);
  }
  if (keptContact.length > 0) {
    const scanId = crypto.randomUUID();
    const logs: LogInsert[] = keptContact.map((k) => ({
      page_id: pageId, scan_id: scanId, registration_id: k.registrationId, field: k.field,
      outcome: "kept-app", sheet_value: k.sheetValue, detail: "The app's value was kept; the sheet was left as it is",
    }));
    const { error } = await db.from("landing_sheet_sync_log").insert(logs);
    if (error) console.error(`${LOG} log write failed:`, (error as { code?: string }).code);
  }

  // 6. Finish: clear the review list, then go live last.
  const { error: dErr } = await db.from("landing_sheet_sync_log").delete().eq("page_id", pageId).eq("outcome", "report");
  if (dErr) throw new Error(dErr.message);
  const { error: lErr } = await db.from("landing_pages").update({ sheet_sync_state: "live" }).eq("id", pageId);
  if (lErr) throw new Error(lErr.message);

  // Start the sheet rewrites now rather than waiting for the daily run. A failure here never fails the approval.
  for (const regId of Array.from(toPush.keys())) runInBackground(runJobsFor(regId));

  return { applied, keptApp: keptContact.length };
}
