// src/lib/data/session-emails.ts
// Server-only. Creates the participant send behind a live-session reminder or time-change email.
// Recipients are frozen here (like createSend); runEmailSend renders and sends them, one signed link each.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { buildFeedbackEmail, buildSessionEmail } from "@/lib/attendance/session-email";
import { getSessionAudience, getSessionById } from "@/lib/data/attendance";
import { matchAudience, parseOption } from "@/lib/classes/audience";
import { attendanceBase } from "@/lib/attendance/links";
import { fetchAllRows, freezeRecipients, plan, sendTestToMe } from "@/lib/data/participant-sends";
import { formatPkt } from "@/lib/attendance/rules";

export type SessionSendResult =
  | { ok: true; sendId: string; count: number }
  | { ok: false; reason: "no_zoom" | "no_feedback_link" | "still_sending" | "already_sent" | "started" | "disabled" | "no_recipients" | "not_set_up" | "too_soon" | "no_audience" | "nobody_missing" };

const TOO_SOON_MS = 60 * 1000;
const STALE_CLAIM_MS = 15 * 60 * 1000;
/** The "new Zoom link" email is the one update email with this subject start. */
const ZOOM_CHANGED_SUBJECT = "New Zoom link";

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
 * out by the resolver (mode = live); members are filtered on their own mode and option.
 * Test rows never come back from the resolver; unsubscribed people are skipped by the planner.
 */
export async function createSessionSend(
  sessionId: string,
  kind: "reminder" | "update" | "feedback" = "reminder",
  // manual = an admin pressed the button: the per-class reminder switch only controls the automatic email.
  opts: { resend?: boolean; manual?: boolean; zoomChanged?: boolean; onlyMissing?: boolean } = {},
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
    if (!session.email_enabled && !opts.manual) return { ok: false, reason: "disabled" };
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
    const { data: recent, error: recentErr } = await admin.from("participant_sends").select("id, subject")
      .eq("session_id", sessionId).eq("session_kind", kind).gte("created_at", since);
    if (recentErr) throw new Error(`recent send check failed: ${recentErr.message}`);
    // A time-change email and a new-Zoom-link email are different emails: only the same one is "too soon".
    const sameKind = ((recent ?? []) as { subject: string }[]).filter(
      (r) => kind !== "update" || (r.subject ?? "").startsWith(ZOOM_CHANGED_SUBJECT) === !!opts.zoomChanged,
    );
    if (sameKind.length > 0) return { ok: false, reason: "too_soon" };
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

  // "Only people who have not got it": anyone already sent, or still queued, for an earlier Zoom link email of this class is left out.
  // Failed and unsent people are included again.
  // Only emails since the latest "new Zoom link" email count, because older ones carried the old link.
  // A row stuck as claimed for over 15 minutes is treated like a failed one. The same inbox counts as the same person.
  const alreadyHave = new Set<string>();
  const alreadyEmails = new Set<string>();
  if (opts.onlyMissing) {
    const { data: earlier, error: earlierErr } = await admin.from("participant_sends").select("id, created_at, subject")
      .eq("session_id", sessionId).in("session_kind", ["reminder", "update"]);
    if (earlierErr) throw new Error(`earlier sends read failed: ${earlierErr.message}`);
    const sends = (earlier ?? []) as { id: string; created_at: string; subject: string }[];
    const zoomTimes = sends.filter((s) => (s.subject ?? "").startsWith(ZOOM_CHANGED_SUBJECT)).map((s) => s.created_at).sort();
    const since = zoomTimes.length > 0 ? zoomTimes[zoomTimes.length - 1] : "";
    const earlierIds = sends.filter((s) => s.created_at >= since).map((s) => s.id);
    if (earlierIds.length > 0) {
      const staleBefore = Date.now() - STALE_CLAIM_MS;
      const got = await fetchAllRows<{ registration_id: string; email: string; state: string; claimed_at: string | null }>("earlier recipients read", () =>
        admin.from("participant_send_recipients").select("registration_id, email, state, claimed_at").in("send_id", earlierIds)
          .in("state", ["sent", "pending", "claimed"]).order("id", { ascending: true }));
      for (const r of got) {
        if (r.state === "claimed" && (!r.claimed_at || new Date(r.claimed_at).getTime() < staleBefore)) continue;
        alreadyHave.add(r.registration_id);
        if ((r.email ?? "").trim() !== "") alreadyEmails.add(r.email.trim().toLowerCase());
      }
    }
  }

  const { planned, summary } = await plan({
    pageId: session.page_id,
    channel: "email",
    // Same rule as the class preview: someone with no PZ ID yet is not emailed.
    requirePzId: true,
    // A live-only audience can be narrowed up front; "any" must be able to reach recorded students.
    filters: audience.mode === "live" ? { mode: "live" } : {},
    keep: (c) =>
      !alreadyHave.has(c.registrationId) &&
      !alreadyEmails.has((c.email ?? "").trim().toLowerCase()) &&
      (c.status === "paid" || c.status === "free") &&
      matchAudience(parseOption(c.optionLabel ?? ""), audience).include,
  });
  if (planned.send.length === 0) return { ok: false, reason: opts.onlyMissing && alreadyHave.size > 0 ? "nobody_missing" : "no_recipients" };

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

/**
 * One test copy of the Zoom-link email to the admin's own address: real Zoom, time and links, sample name.
 * Nothing is recorded and no student is touched.
 */
export async function sendSessionTest(sessionId: string, toEmail: string): Promise<{ ok: true } | { ok: false; reason: "no_zoom" | "not_set_up" | "failed" }> {
  const session = await getSessionById(sessionId);
  if (!session) throw new Error("Session not found");
  if (session.zoom_url.trim() === "") return { ok: false, reason: "no_zoom" };
  if (!process.env.BREVO_API_KEY_PARTICIPANTS) return { ok: false, reason: "not_set_up" };
  const msg = buildSessionEmail(session, "reminder");
  const res = await sendTestToMe({
    subject: msg.subject,
    body: msg.body,
    toEmail,
    pageId: session.page_id,
    session: {
      zoomUrl: session.zoom_url,
      kahootUrl: session.include_kahoot ? session.kahoot_url : "",
      timeText: formatPkt(session.starts_at),
      attendanceUrl: `${attendanceBase()}/attend/${session.public_code}`,
    },
  });
  return res.ok ? { ok: true } : { ok: false, reason: "failed" };
}

export type SessionEmailKind = "reminder" | "update" | "feedback";
export type SessionEmailRound = {
  id: string;
  kind: SessionEmailKind;
  subject: string;
  createdAt: string;
  total: number;
  counts: { sent: number; failed: number; skipped: number; waiting: number };
  recipients: { name: string; email: string; state: string; reason: string }[];
};

/** Every email sent for one class (newest first): when, how many got it, and each person's result. */
export async function listSessionEmailHistory(sessionId: string): Promise<SessionEmailRound[]> {
  const admin = createAdminSupabase();
  const { data: sends, error } = await admin.from("participant_sends")
    .select("id, session_kind, subject, created_at, recipient_count").eq("session_id", sessionId).order("created_at", { ascending: false });
  if (error) throw new Error(`session sends read failed: ${error.message}`);
  const out: SessionEmailRound[] = [];
  for (const s of (sends ?? []) as { id: string; session_kind: string | null; subject: string | null; created_at: string; recipient_count: number }[]) {
    const recipients = await fetchAllRows<{ name: string; email: string; state: string; reason: string }>("session recipients read", () =>
      admin.from("participant_send_recipients").select("name, email, state, reason").eq("send_id", s.id)
        .order("name", { ascending: true }).order("id", { ascending: true }));
    const counts = { sent: 0, failed: 0, skipped: 0, waiting: 0 };
    for (const r of recipients) {
      if (r.state === "sent") counts.sent += 1;
      else if (r.state === "failed") counts.failed += 1;
      else if (r.state === "skipped") counts.skipped += 1;
      else counts.waiting += 1;
    }
    const kind: SessionEmailKind = s.session_kind === "feedback" || s.session_kind === "update" ? s.session_kind : "reminder";
    out.push({ id: s.id, kind, subject: s.subject ?? "", createdAt: s.created_at, total: s.recipient_count, counts, recipients });
  }
  return out;
}
