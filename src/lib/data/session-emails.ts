// src/lib/data/session-emails.ts
// Server-only. Creates the participant send behind a live-session reminder or time-change email.
// Recipients are frozen here (like createSend); runEmailSend renders and sends them, one signed link each.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildSessionEmail } from "@/lib/attendance/session-email";
import { getSessionById } from "@/lib/data/attendance";
import { freezeRecipients, plan } from "@/lib/data/participant-sends";

export type SessionSendResult =
  | { ok: true; sendId: string; count: number }
  | { ok: false; reason: "no_zoom" | "already_sent" | "started" | "disabled" | "no_recipients" | "not_set_up" | "too_soon" };

const TOO_SOON_MS = 60 * 1000;

/**
 * Enrolled (paid or free) live registrations only: heads and their members. Recorded heads are filtered
 * out by the resolver (mode = live) and their members come only through their lead, so they are out too.
 * Test rows never come back from the resolver; unsubscribed people are skipped by the planner.
 */
export async function createSessionSend(sessionId: string, kind: "reminder" | "update" = "reminder"): Promise<SessionSendResult> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.zoom_url.trim() === "") return { ok: false, reason: "no_zoom" };
  if (kind === "reminder") {
    if (new Date(session.starts_at).getTime() <= Date.now()) return { ok: false, reason: "started" };
    if (!session.email_enabled) return { ok: false, reason: "disabled" };
  }
  const admin = createAdminSupabase();
  if (kind === "update") {
    const since = new Date(Date.now() - TOO_SOON_MS).toISOString();
    const { data: recent, error: recentErr } = await admin.from("participant_sends").select("id")
      .eq("session_id", sessionId).eq("session_kind", "update").gte("created_at", since);
    if (recentErr) throw new Error(`recent update check failed: ${recentErr.message}`);
    if ((recent ?? []).length > 0) return { ok: false, reason: "too_soon" };
  }
  if (!process.env.BREVO_API_KEY_PARTICIPANTS) return { ok: false, reason: "not_set_up" };

  const { planned, summary } = await plan({
    pageId: session.page_id,
    channel: "email",
    filters: { mode: "live" },
    keep: (c) => c.status === "paid" || c.status === "free",
  });
  if (planned.send.length === 0) return { ok: false, reason: "no_recipients" };

  const msg = buildSessionEmail(session, kind);
  const { data: sendRow, error: sendErr } = await admin.from("participant_sends").insert({
    page_id: session.page_id,
    channel: "email",
    subject: msg.subject,
    body: msg.body,
    template_id: null,
    recipient_count: planned.send.length,
    not_paid_count: summary.notPaid,
    not_paid_confirmed: false,
    created_by: null,
    session_id: sessionId,
    session_kind: kind,
  }).select("id").single();
  if (sendErr) {
    // A concurrent reminder lost the race on the unique index: that is "already sent", not a failure.
    if (sendErr.code === "23505" || /participant_sends_reminder_key/.test(sendErr.message)) return { ok: false, reason: "already_sent" };
    throw new Error(`send insert failed: ${sendErr.message}`);
  }
  if (!sendRow) throw new Error("send insert failed: no row");
  const sendId = (sendRow as { id: string }).id;
  await freezeRecipients(sendId, planned);
  return { ok: true, sendId, count: planned.send.length };
}
