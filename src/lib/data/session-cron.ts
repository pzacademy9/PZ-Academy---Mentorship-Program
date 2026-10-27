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

/** Session sends (reminder or update) that still have pending recipients, oldest first, at most max. One query. */
export async function listSessionSendsWithPending(max: number): Promise<string[]> {
  const { data, error } = await createAdminSupabase().from("participant_send_recipients")
    .select("send_id, participant_sends!inner(session_id, session_kind, created_at)")
    .eq("state", "pending")
    .not("participant_sends.session_kind", "is", null)
    .limit(2000);
  if (error) throw new Error(`pending sends read failed: ${error.message}`);
  const created = new Map<string, string>();
  for (const r of (data ?? []) as unknown as { send_id: string; participant_sends: { created_at: string } | { created_at: string }[] | null }[]) {
    const ps = Array.isArray(r.participant_sends) ? r.participant_sends[0] : r.participant_sends;
    if (!created.has(r.send_id)) created.set(r.send_id, ps?.created_at ?? "");
  }
  return Array.from(created.entries())
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .slice(0, max)
    .map(([id]) => id);
}
