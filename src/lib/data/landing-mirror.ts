import "server-only";
import { createHash } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { checkStatusChange, STATUS_CHANGE_MESSAGES, type ChangeableStatus } from "@/lib/landing/registration/status-rules";
import { parseCsv, isCsvSheet } from "@/lib/landing/mirror/csv";
import { mapSheetRow, type MapResult } from "@/lib/landing/mirror/rows";
import { planMirror, type AppRowLite, type MemoryRow, type MirrorAction } from "@/lib/landing/mirror/plan";

// Hard rule: a change that comes from the sheet sends nothing (no emails, no Meta events, no enrollment, no sheet rewrite).
// This module must never import the follow-up, email or job functions.

type RegRow = Database["public"]["Tables"]["landing_registrations"]["Row"];
type RegInsert = Database["public"]["Tables"]["landing_registrations"]["Insert"];
type ApplyArgs = Database["public"]["Functions"]["landing_apply_status"]["Args"];

const LOG = "[landing-mirror]";
const CHUNK = 1000;
// Exported so the sync route can tell "not configured" apart from other failures.
export const MIRROR_PAGE_NOT_FOUND = "Page not found";
export const MIRROR_NO_SHEET = "No valid sheet is linked to this page";
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,80}$/;

export interface MirrorResult {
  ok: boolean; preview: boolean; inserted: number; changed: number; linked: number; skipped: number;
  problems: { rowNumber: number; reason: string }[]; notes: string[]; error?: string; ranAt: string;
}

function blank(preview: boolean): MirrorResult {
  return { ok: true, preview, inserted: 0, changed: 0, linked: 0, skipped: 0, problems: [], notes: [], ranAt: new Date().toISOString() };
}
const failed = (preview: boolean, error: string): MirrorResult => ({ ...blank(preview), ok: false, error });

async function loadAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await page(from, from + CHUNK - 1);
    if (error) throw new Error("load failed");
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return all;
}

async function fetchSheet(sheetId: string): Promise<string[][] | null> {
  try {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`, { signal: AbortSignal.timeout(20000) });
    if (res.status !== 200) return null;
    const rows = parseCsv(await res.text());
    return isCsvSheet(rows) ? rows : null;
  } catch {
    return null;
  }
}

const toApp = (r: RegRow): AppRowLite => ({
  id: r.id, email: r.email, createdAt: new Date(r.created_at), status: r.status as RegistrationStatus,
  amountReceived: r.amount_received === null ? null : Number(r.amount_received),
  statusSource: r.status_source === "sheet" ? "sheet" : "app", rowType: r.row_type as AppRowLite["rowType"],
});

export async function runMirror(pageId: string, opts: { preview?: boolean } = {}): Promise<MirrorResult> {
  const preview = opts.preview === true;
  const db = createAdminSupabase();

  const { data: page, error: pErr } = await db
    .from("landing_pages").select("id, mirror_sheet_id, mirror_last_result").eq("id", pageId).maybeSingle();
  if (pErr || !page) return failed(preview, MIRROR_PAGE_NOT_FOUND);
  const sheetId = page.mirror_sheet_id as string | null;
  if (!sheetId || !SHEET_ID_PATTERN.test(sheetId)) return failed(preview, MIRROR_NO_SHEET);

  const lockValue = new Date().toISOString();
  if (!preview) {
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: got, error: lErr } = await db
      .from("landing_pages").update({ mirror_running_at: lockValue })
      .eq("id", pageId).or(`mirror_running_at.is.null,mirror_running_at.lt."${cutoff}"`).select("id");
    if (lErr) { console.error(`${LOG} lock failed:`, (lErr as { code?: string }).code); return failed(preview, "Could not start"); }
    if (!got || got.length === 0) return failed(preview, "Already running");
  }

  try {
    let result: MirrorResult;
    try {
      result = await execute(pageId, sheetId, preview);
    } catch (e) {
      console.error(`${LOG} run crashed:`, (e as { code?: string })?.code ?? "unknown");
      result = failed(preview, "Something went wrong");
    }
    if (!preview) {
      let stored: unknown = result;
      if (!result.ok) {
        const prev = page.mirror_last_result as { ok?: unknown; lastGood?: unknown } | null;
        const lastGood = prev && prev.ok === true ? prev : prev?.lastGood;
        stored = lastGood ? { ...result, lastGood } : result;
      }
      const { error } = await db.from("landing_pages")
        .update({ mirror_last_run_at: result.ranAt, mirror_last_result: stored as Json }).eq("id", pageId);
      if (error) console.error(`${LOG} result save failed:`, (error as { code?: string }).code);
    }
    return result;
  } finally {
    if (!preview) {
      // Only release our own lock: a later run that took over a stale lock keeps its own.
      const { error } = await db.from("landing_pages").update({ mirror_running_at: null }).eq("id", pageId).eq("mirror_running_at", lockValue);
      if (error) console.error(`${LOG} unlock failed:`, (error as { code?: string }).code);
    }
  }
}

async function execute(pageId: string, sheetId: string, preview: boolean): Promise<MirrorResult> {
  const db = createAdminSupabase();
  const csv = await fetchSheet(sheetId);
  if (!csv) return failed(preview, "Could not read the sheet");

  const header = csv[0];
  const sheet = csv.slice(1)
    .map((cells, i) => ({ rowNumber: i + 2, cells }))
    .filter((r) => r.cells.some((c) => c.trim() !== ""))
    .map((r) => ({ rowNumber: r.rowNumber, mapped: mapSheetRow(header, r.cells) as MapResult }));
  const rowNumberByKey = new Map<string, number>();
  for (const s of sheet) if (s.mapped.ok) rowNumberByKey.set(s.mapped.row.key, s.rowNumber);

  let regs: RegRow[];
  let memoryRows: { row_key: string; registration_id: string; last_status: string; last_amount: number | null }[];
  try {
    regs = await loadAll<RegRow>((a, b) => db.from("landing_registrations").select("*").eq("page_id", pageId)
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(a, b));
    memoryRows = await loadAll((a, b) => db.from("landing_mirror_rows").select("*").eq("page_id", pageId)
      .order("row_key", { ascending: true }).range(a, b));
  } catch {
    return failed(preview, "Could not read the app data");
  }
  const memory: MemoryRow[] = memoryRows.map((m) => ({
    rowKey: m.row_key, registrationId: m.registration_id, lastStatus: m.last_status as RegistrationStatus,
    lastAmount: m.last_amount === null ? null : Number(m.last_amount),
  }));
  const regById = new Map(regs.map((r) => [r.id, r]));
  const actions = planMirror(sheet, regs.map(toApp), memory);

  const res = blank(preview);
  // A failed memory save is safe: the next run links the row again by email + time.
  const remember = async (rowKey: string, registrationId: string, status: RegistrationStatus, amount: number | null) => {
    if (preview) return;
    const { error } = await db.from("landing_mirror_rows").upsert(
      { page_id: pageId, row_key: rowKey, registration_id: registrationId, last_status: status, last_amount: amount, last_seen_at: new Date().toISOString() },
      { onConflict: "page_id,row_key" });
    if (error) console.error(`${LOG} memory save failed:`, (error as { code?: string }).code);
  };

  // Ref ids and group leads known so far (existing plus inserted in this run).
  const usedRefs = new Set(regs.map((r) => r.ref_id).filter((x): x is string => !!x));
  const leadIdByEmail = new Map<string, string>();
  for (const r of regs) if (r.row_type === "lead") leadIdByEmail.set(r.email.trim().toLowerCase(), r.id);
  const failedLeads = new Set<string>();
  const freeRef = (base: string): string => {
    let ref = base;
    for (let n = 2; usedRefs.has(ref); n++) ref = `${base}-dup${n}`;
    return ref;
  };

  const doInsert = async (action: Extract<MirrorAction, { kind: "insert" }>) => {
    const row = action.row;
    const rowNumber = rowNumberByKey.get(row.key) ?? 0;
    const problem = (reason: string) => res.problems.push({ rowNumber, reason });
    const isMember = row.rowType === "member";
    let leadId: string | null = null;
    if (isMember) {
      if (failedLeads.has(row.leadEmail)) { problem("The group lead could not be saved"); return; }
      leadId = leadIdByEmail.get(row.leadEmail) ?? null;
      if (!leadId) { problem("Group member without a group lead"); return; }
    }
    let baseRef: string | null = row.refId || null;
    if (!isMember && !baseRef) {
      baseRef = "SHEETMIR-" + createHash("sha256").update(`${pageId}|${row.key}`).digest("hex").slice(0, 10).toUpperCase();
      if (res.notes.length < 20) res.notes.push(`Row ${rowNumber} had no Ref ID, one was made`);
    }
    let refId = baseRef ? freeRef(baseRef) : null;
    if (preview) { res.inserted++; if (refId) usedRefs.add(refId); return; }

    const build = (ref: string | null): RegInsert => ({
      page_id: pageId, row_type: row.rowType, lead_registration_id: leadId, name: row.name, email: row.email,
      whatsapp: row.whatsapp, profession: row.profession, discovery: row.discovery, consent: row.consent,
      region: row.region, currency: row.currency, option_label: row.optionLabel, mode: row.mode, tier_key: row.tierKey,
      group_size: row.groupSize, promo_code_text: row.promoCodeText, expected_amount: row.expectedAmount,
      payment_method: row.paymentMethod, voucher_url: row.voucherUrl, status: row.status, amount_received: row.amountReceived,
      email_status: row.emailStatusText, status_source: "sheet", is_test: false, ref_id: ref,
      created_at: row.submittedAt.toISOString(),
    });
    // Ref ids are unique across the whole table, other pages included: on a clash try the next suffix.
    let data: unknown = null;
    let error: { code?: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await db.from("landing_registrations").insert(build(refId)).select("id").single();
      data = r.data; error = r.error as { code?: string } | null;
      if (!error && data) break;
      if (error?.code === "23505" && refId && baseRef) { usedRefs.add(refId); refId = freeRef(baseRef); continue; }
      break;
    }
    if (error || !data) {
      console.error(`${LOG} insert failed:`, error?.code ?? "none");
      problem("Could not save this row");
      if (row.rowType === "lead") failedLeads.add(row.email);
      return;
    }
    const id = (data as { id: string }).id;
    if (refId) usedRefs.add(refId);
    if (row.rowType === "lead") leadIdByEmail.set(row.email, id);
    res.inserted++;
    await remember(row.key, id, row.status, row.amountReceived);
  };

  const doApply = async (a: Extract<MirrorAction, { kind: "apply" }>) => {
    const rowNumber = rowNumberByKey.get(a.rowKey) ?? 0;
    const problem = (reason: string) => res.problems.push({ rowNumber, reason });
    const rec = regById.get(a.registrationId);
    if (!rec) { problem("App row is gone"); return; }
    if (a.to === "free") { problem("Free is not a status the app can set from the sheet"); return; }
    const check = checkStatusChange({
      rowType: rec.row_type as AppRowLite["rowType"], from: a.from, to: a.to as ChangeableStatus,
      expectedAmount: rec.expected_amount === null ? null : Number(rec.expected_amount), amount: a.amount,
    });
    if (!check.ok) {
      if (check.reason === "already-in-status") res.skipped++;
      else problem(STATUS_CHANGE_MESSAGES[check.reason]);
      return;
    }
    if (preview) { res.changed++; return; }
    const args: ApplyArgs = {
      p_registration_id: rec.id, p_to_status: a.to, p_expected_from: a.from, p_amount: check.amountReceived,
      p_actor: null, p_source: "sheet",
    };
    const { data, error } = await db.rpc("landing_apply_status", args);
    if (error) { console.error(`${LOG} status change failed:`, error.code); problem("Could not save this status change"); return; }
    const r = (data ?? {}) as { ok?: unknown; reason?: unknown };
    if (r.ok !== true) {
      if (r.reason === "stale") res.skipped++;
      else if (r.reason === "already-in-status") { res.skipped++; await remember(a.rowKey, a.registrationId, a.to, a.amount); }
      else if (r.reason === "free-row") problem(STATUS_CHANGE_MESSAGES["free-row"]);
      else if (r.reason === "not-found") problem("App row is gone");
      else { console.warn(`${LOG} unmapped rpc reason`); problem("Could not save this status change"); }
      return;
    }
    res.changed++;
    await remember(a.rowKey, a.registrationId, a.to, a.amount);
  };

  for (const action of actions) {
    switch (action.kind) {
      case "insert": await doInsert(action); break;
      case "apply": await doApply(action); break;
      case "link":
        res.linked++;
        await remember(action.rowKey, action.registrationId, action.status, action.amount);
        break;
      case "remember":
        res.skipped++;
        await remember(action.rowKey, action.registrationId, action.status, action.amount);
        break;
      case "skip": res.skipped++; break;
      case "problem": res.problems.push({ rowNumber: action.rowNumber, reason: action.reason }); break;
    }
  }
  return res;
}

export async function runMirrorForAllPages(): Promise<{ pageId: string; result: MirrorResult }[]> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("id, mirror_sheet_id").neq("mirror_sheet_id", "");
  if (error) throw new Error("Could not list pages");
  const out: { pageId: string; result: MirrorResult }[] = [];
  for (const p of (data ?? []).filter((x) => typeof x.mirror_sheet_id === "string" && x.mirror_sheet_id !== "")) {
    let result: MirrorResult;
    try { result = await runMirror(p.id as string); } catch { result = failed(false, "Unexpected error"); }
    out.push({ pageId: p.id as string, result });
  }
  return out;
}
