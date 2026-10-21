import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { checkStatusChange, type ChangeableStatus } from "@/lib/landing/registration/status-rules";
import { parseSheetStatus, type PlannedChange } from "@/lib/landing/registration/sheet-sync-engine";
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
export async function saveSnapshots(regs: SnapshotInput[]): Promise<void> {
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
  const { error } = await createAdminSupabase().from("landing_sheet_snapshots").upsert(rows, { onConflict: "registration_id" });
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
