// src/lib/data/session-cron.ts
// Server-only. Read helpers for the 5-minute session email timer.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const MAX_LEAD_MS = 10080 * 60 * 1000;

/** Sessions whose reminder is due: enabled, not started, now >= starts_at - lead, and no reminder send yet. */
export async function listDueReminderSessionIds(now = new Date()): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("batch_sessions")
    .select("id, starts_at, email_lead_minutes")
    .eq("email_enabled", true)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + MAX_LEAD_MS).toISOString());
  if (error) throw new Error(`due sessions read failed: ${error.message}`);
  const due = ((data ?? []) as { id: string; starts_at: string; email_lead_minutes: number }[])
    .filter((s) => now.getTime() >= new Date(s.starts_at).getTime() - s.email_lead_minutes * 60 * 1000);
  if (due.length === 0) return [];
  const { data: sent, error: sentErr } = await admin.from("participant_sends")
    .select("session_id").eq("session_kind", "reminder").in("session_id", due.map((s) => s.id));
  if (sentErr) throw new Error(`reminder sends read failed: ${sentErr.message}`);
  const done = new Set(((sent ?? []) as { session_id: string | null }[]).map((r) => r.session_id));
  return due.filter((s) => !done.has(s.id)).map((s) => s.id);
}

/** Session sends (reminder or update) that still have pending recipients, oldest first. */
export async function listSessionSendsWithPending(max: number): Promise<string[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("participant_sends")
    .select("id").not("session_id", "is", null).order("created_at", { ascending: true }).limit(500);
  if (error) throw new Error(`session sends read failed: ${error.message}`);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  const out: string[] = [];
  for (const id of ids) {
    if (out.length >= max) break;
    const { data: p, error: pErr } = await admin.from("participant_send_recipients")
      .select("id").eq("send_id", id).eq("state", "pending").limit(1);
    if (pErr) throw new Error(`pending read failed: ${pErr.message}`);
    if ((p ?? []).length > 0) out.push(id);
  }
  return out;
}
