// src/lib/data/session-emails.ts
// Server-only. Creates the participant send behind a live-session reminder or time-change email.
// Recipients are frozen here (like createSend); runEmailSend renders and sends them, one signed link each.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildFeedbackEmail, buildSessionEmail } from "@/lib/attendance/session-email";
import { getSessionAudience, getSessionById } from "@/lib/data/attendance";
import { matchAudience, parseOption } from "@/lib/classes/audience";
import { attendanceBase } from "@/lib/attendance/links";
import { freezeRecipients, plan } from "@/lib/data/participant-sends";

export type SessionSendResult =
  | { ok: true; sendId: string; count: number }
  | { ok: false; reason: "no_zoom" | "no_feedback_link" | "still_sending" | "already_sent" | "started" | "disabled" | "no_recipients" | "not_set_up" | "too_soon" | "no_audience" };

const TOO_SOON_MS = 60 * 1000;

export type SessionSendState = { reminderAt: string | null; updateAt: string | null };

/** When the reminder and the latest time-change email went out, per session (missing key = nothing sent). */
export async function listSessionSendState(sessionIds: string[]): Promise<Record<string, SessionSendState>> {
  const out: Record<string, SessionSendState> = {};
  if (sessionIds.length === 0) return out;
  const { data, error } = await createAdminSupabase().from("participant_sends")
    .select("session_id, session_kind, created_at").in("session_id", sessionIds);
  if (error) throw new Error(`session sends read failed: ${error.message}`);
  for (const r of (data ?? []) as { session_id: string | null; session_kind: string | null; created_at: string }[]) {
    if (!r.session_id) continue;
    const s = (out[r.session_id] ??= { reminderAt: null, updateAt: null });
    if (r.session_kind === "reminder") s.reminderAt = r.created_at;
    if (r.session_kind === "update" && (s.updateAt === null || r.created_at > s.updateAt)) s.updateAt = r.created_at;
  }
  return out;
}

/**
 * Enrolled (paid or free) live registrations only: heads and their members. Recorded heads are filtered
 * out by the resolver (mode = live) and their members come only through their lead, so they are out too.
 * Test rows never come back from the resolver; unsubscribed people are skipped by the planner.
 */
export async function createSessionSend(
  sessionId: string,
  kind: "reminder" | "update" | "feedback" = "reminder",
  opts: { resend?: boolean } = {},
): Promise<SessionSendResult> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("Session not found");
  // A class with no chosen audience sends nothing, for every kind of email.
  const audience = getSessionAudience(session);
  if (!audience) return { ok: false, reason: "no_audience" };
  // The feedback email needs a feedback link, not a Zoom link.
  if (kind !== "feedback" && session.zoom_url.trim() === "") return { ok: false, reason: "no_zoom" };
  if (kind === "reminder") {
    if (new Date(session.starts_at).getTime() <= Date.now()) return { ok: false, reason: "started" };
    if (!session.email_enabled) return { ok: false, reason: "disabled" };
  }
  const admin = createAdminSupabase();
  let feedbackUrl = "";
  if (kind === "feedback") {
    if (!session.feedback_session_id) return { ok: false, reason: "no_feedback_link" };
    const { data: fs, error: fsErr } = await admin.from("feedback_sessions").select("slug").eq("id", session.feedback_session_id).maybeSingle();
    if (fsErr) throw new Error(`feedback link read failed: ${fsErr.message}`);
    const slug = (fs as { slug: string | null } | null)?.slug;
    if (!slug) return { ok: false, reason: "no_feedback_link" };
    feedbackUrl = `${attendanceBase()}/feedback/${slug}`;
  }
  if (kind === "update" || kind === "feedback") {
    const since = new Date(Date.now() - TOO_SOON_MS).toISOString();
    const { data: recent, error: recentErr } = await admin.from("participant_sends").select("id")
      .eq("session_id", sessionId).eq("session_kind", kind).gte("created_at", since);
    if (recentErr) throw new Error(`recent send check failed: ${recentErr.message}`);
    if ((recent ?? []).length > 0) return { ok: false, reason: "too_soon" };
  }
  if (kind === "feedback") {
    // An earlier feedback send for this class that still has people waiting (pending or being sent) must finish first.
    const { data: earlier, error: earlierErr } = await admin.from("participant_sends").select("id")
      .eq("session_id", sessionId).eq("session_kind", "feedback");
    if (earlierErr) throw new Error(`earlier send check failed: ${earlierErr.message}`);
    const ids = ((earlier ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length > 0) {
      const { data: waiting, error: waitErr } = await admin.from("participant_send_recipients").select("id")
        .in("send_id", ids).in("state", ["pending", "claimed"]).limit(1);
      if (waitErr) throw new Error(`waiting recipients check failed: ${waitErr.message}`);
      if ((waiting ?? []).length > 0) return { ok: false, reason: "still_sending" };
    }
  }
  if (!process.env.BREVO_API_KEY_PARTICIPANTS) return { ok: false, reason: "not_set_up" };

  const { planned, summary } = await plan({
    pageId: session.page_id,
    channel: "email",
    // A live-only audience can be narrowed up front; "any" must be able to reach recorded students.
    filters: audience.mode === "live" ? { mode: "live" } : {},
    keep: (c) =>
      (c.status === "paid" || c.status === "free") &&
      matchAudience(parseOption(c.optionLabel ?? ""), audience).include,
  });
  if (planned.send.length === 0) return { ok: false, reason: "no_recipients" };

  let batchTitle = "";
  if (kind === "feedback") {
    const { data: page } = await admin.from("landing_pages").select("title").eq("id", session.page_id).maybeSingle();
    batchTitle = (page as { title: string | null } | null)?.title ?? "";
  }
  let msg: { subject: string; body: string };
  if (kind === "feedback") {
    // The link is the same for everyone; the greeting is filled in per person when the email is sent.
    const fb = buildFeedbackEmail({
      batchTitle,
      classTitle: session.title.trim() !== "" ? session.title.trim() : `Session ${session.number}`,
      feedbackUrl,
      firstName: "{{first_name}}",
    });
    msg = { subject: fb.subject, body: fb.text };
  } else {
    msg = buildSessionEmail(session, kind, opts);
  }
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
