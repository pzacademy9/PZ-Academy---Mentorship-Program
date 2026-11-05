// src/lib/data/progress-reports.ts
// Admin-only. Bulk progress report emails for one batch (the old Apps Script "Send all reports").
// A round's recipient list is frozen when it is created; running it only ever sends to rows still
// pending, and each row is claimed before sending, so no student is emailed twice in a round.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/data/attendance";
import { audienceFromJson } from "@/lib/classes/audience";
import { getOrCreateToken, listUnsubscribed } from "@/lib/data/participant-prefs";
import { sendParticipantEmail } from "@/lib/brevo-participants";
import { buildBatchReport, type BatchReport, type ReportQuizRow, type StudentReport } from "@/lib/progress/report-build";
import { DEFAULT_YOUTUBE, renderReportEmail } from "@/lib/progress/report-email";
import type { PortalPersonInput, PortalRegInput, PortalSessionInput } from "@/lib/progress/portal-build";
import type { ProgressKind } from "@/lib/progress/build";

const CHUNK = 200;
const CONCURRENCY = 4;
const STALE_CLAIM_MS = 15 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAY_HAVE_BEEN_SENT = "May have been sent. Check before sending again.";
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";

type DbError = { message: string; code?: string } | null;
function check(what: string, error: DbError): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}
function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

export type ReportBatch = { pageId: string; report: BatchReport };

/** Builds the report for every enrolled (paid or free, non-test) student of a batch. Null for an unknown page. */
export async function loadBatchReport(pageId: string, now: Date = new Date()): Promise<ReportBatch | null> {
  if (!UUID.test(pageId)) return null;
  const admin = createAdminSupabase();
  const { data: page, error: pErr } = await admin
    .from("landing_pages")
    .select("id, title, slug, kind, attendance_min_pct")
    .eq("id", pageId)
    .maybeSingle();
  check("batch read", pErr);
  if (!page) return null;
  const p = page as { id: string; title: string; slug: string; kind: string; attendance_min_pct: number };

  const regs = await fetchAll<{ person_id: string | null; email: string; mode: string; option_label: string; created_at: string }>(
    "registrations read",
    () =>
      admin
        .from("landing_registrations")
        .select("person_id, email, mode, option_label, created_at")
        .eq("page_id", pageId)
        .in("status", ["paid", "free"])
        .eq("is_test", false)
        .order("id", { ascending: true }),
  );
  const personIds = Array.from(new Set(regs.map((r) => r.person_id).filter((id): id is string => !!id)));

  const people: PortalPersonInput[] = [];
  for (const part of chunks(personIds)) {
    const rows = await fetchAll<{ id: string; pz_id: string; display_name: string }>("people read", () =>
      admin.from("pz_people").select("id, pz_id, display_name").in("id", part).order("id", { ascending: true }),
    );
    for (const r of rows) people.push({ id: r.id, pzId: r.pz_id, displayName: r.display_name });
  }

  const sessionRows = await fetchAll<{ id: string; number: number; title: string; starts_at: string; audience: unknown; quiz_max_score: number | null }>(
    "sessions read",
    () =>
      admin
        .from("batch_sessions")
        .select("id, number, title, starts_at, audience, quiz_max_score")
        .eq("page_id", pageId)
        .order("id", { ascending: true }),
  );
  const sessions: PortalSessionInput[] = [];
  for (const s of sessionRows) {
    const audience = s.audience === null || s.audience === undefined ? null : audienceFromJson(s.audience);
    if (s.audience !== null && s.audience !== undefined && audience === null) continue; // unreadable audience: left out, like the website
    sessions.push({ id: s.id, number: s.number, title: s.title, startsAt: s.starts_at, audience, quizMax: s.quiz_max_score });
  }

  const marks: { sessionId: string; personId: string; how: "check-in" | "admin" }[] = [];
  const quiz: ReportQuizRow[] = [];
  for (const part of chunks(sessions.map((s) => s.id))) {
    const m = await fetchAll<{ session_id: string; person_id: string; source: string }>("marks read", () =>
      admin.from("batch_session_marks").select("session_id, person_id, source").in("session_id", part).order("id", { ascending: true }),
    );
    for (const x of m) marks.push({ sessionId: x.session_id, personId: x.person_id, how: x.source === "admin" ? "admin" : "check-in" });
    const q = await fetchAll<{ session_id: string; person_id: string; score: number; correct: number; incorrect: number }>("quiz results read", () =>
      admin.from("batch_quiz_results").select("session_id, person_id, score, correct, incorrect").in("session_id", part).order("id", { ascending: true }),
    );
    for (const x of q) quiz.push({ sessionId: x.session_id, personId: x.person_id, score: x.score, correct: x.correct, incorrect: x.incorrect });
  }

  // The newest registration's email for each person in this batch.
  const emails: Record<string, string> = {};
  const newest: Record<string, string> = {};
  const regInputs: PortalRegInput[] = [];
  for (const r of regs) {
    if (!r.person_id) continue;
    regInputs.push({ personId: r.person_id, mode: r.mode === "live" ? "live" : "recorded", optionLabel: r.option_label });
    if (!newest[r.person_id] || r.created_at > newest[r.person_id]) {
      newest[r.person_id] = r.created_at;
      emails[r.person_id] = (r.email ?? "").trim().toLowerCase();
    }
  }

  const report = buildBatchReport({
    pageId: p.id,
    title: p.title,
    slug: p.slug,
    kind: p.kind as ProgressKind,
    minPct: p.attendance_min_pct,
    sessions,
    people,
    regs: regInputs,
    marks,
    quiz,
    emails,
    now,
  });
  return { pageId: p.id, report };
}

async function linksFor(slug: string, email: string) {
  const token = await getOrCreateToken(email);
  return {
    portalUrl: `${appUrl()}/progress/${encodeURIComponent(slug)}`,
    youtubeUrl: DEFAULT_YOUTUBE,
    unsubscribeUrl: `${appUrl()}/unsubscribe/participants/${token}`,
  };
}

/** The email one student would get, for the preview. */
export function previewFor(batch: BatchReport, student: StudentReport): { subject: string; html: string } {
  return renderReportEmail(batch, student, {
    portalUrl: `${appUrl()}/progress/${encodeURIComponent(batch.slug)}`,
    youtubeUrl: DEFAULT_YOUTUBE,
    unsubscribeUrl: `${appUrl()}/unsubscribe/participants/preview`,
  });
}

/** Sends one student's report to the admin, marked [TEST]. */
export async function sendReportTest(pageId: string, personId: string, toEmail: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const loaded = await loadBatchReport(pageId);
  if (!loaded) return { ok: false, message: "This batch was not found." };
  const student = loaded.report.students.find((s) => s.personId === personId) ?? loaded.report.students[0];
  if (!student) return { ok: false, message: "This batch has no students yet." };
  const msg = previewFor(loaded.report, student);
  const res = await sendParticipantEmail({ to: toEmail, subject: `[TEST] ${msg.subject}`, htmlContent: msg.html });
  return res.ok ? { ok: true } : { ok: false, message: res.error === "Participant email is not set up" ? "Email sending is not set up yet." : "The test email could not be sent." };
}

/** True when the tables from migration 0105 exist. */
export async function reportTablesReady(): Promise<boolean> {
  const { error } = await createAdminSupabase().from("progress_report_sends").select("id").limit(1);
  return !error;
}

export type CreateReportSendResult = { ok: true; sendId: string; count: number } | { ok: false; message: string };

/** Freezes a new round: every student with an email gets a pending row. */
export async function createReportSend(pageId: string, createdBy: string | null): Promise<CreateReportSendResult> {
  if (!(await reportTablesReady())) return { ok: false, message: "Paste the SQL from the owner steps first, then try again." };
  const loaded = await loadBatchReport(pageId);
  if (!loaded) return { ok: false, message: "This batch was not found." };
  const admin = createAdminSupabase();

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: recent, error: rErr } = await admin.from("progress_report_sends").select("id").eq("page_id", pageId).gte("created_at", since).limit(1);
  check("recent sends read", rErr);
  if ((recent ?? []).length > 0) return { ok: false, message: "Reports were just started for this batch. Wait a minute, or continue the round below." };

  const recipients = loaded.report.students.filter((s) => s.email !== "");
  if (recipients.length === 0) return { ok: false, message: "Nobody to send to." };

  const { data: send, error: sErr } = await admin
    .from("progress_report_sends")
    .insert({ page_id: pageId, created_by: createdBy, recipient_count: recipients.length })
    .select("id")
    .single();
  check("send create", sErr);
  const sendId = (send as { id: string }).id;
  for (let i = 0; i < recipients.length; i += 500) {
    const { error } = await admin.from("progress_report_recipients").insert(
      recipients.slice(i, i + 500).map((s) => ({ send_id: sendId, person_id: s.personId, email: s.email, name: s.name, state: "pending" })),
    );
    check("recipients create", error);
  }
  return { ok: true, sendId, count: recipients.length };
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Sends up to `limit` pending reports of a round, with fresh numbers. Returns how many are still pending. */
export async function runReportSend(sendId: string, limit = 20): Promise<{ sent: number; failed: number; pending: number }> {
  const admin = createAdminSupabase();
  const { data: send, error: sErr } = await admin.from("progress_report_sends").select("id, page_id").eq("id", sendId).maybeSingle();
  check("send read", sErr);
  if (!send) return { sent: 0, failed: 0, pending: 0 };
  const pageId = (send as { page_id: string }).page_id;

  // A run that died mid-way leaves rows claimed; after 15 minutes they turn failed (never re-sent by themselves).
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { error: staleErr } = await admin
    .from("progress_report_recipients")
    .update({ state: "failed", reason: MAY_HAVE_BEEN_SENT })
    .eq("send_id", sendId)
    .eq("state", "claimed")
    .lt("claimed_at", cutoff);
  check("stale claim reset", staleErr);

  const { data: pendingData, error: pErr } = await admin
    .from("progress_report_recipients")
    .select("id, person_id, email, name")
    .eq("send_id", sendId)
    .eq("state", "pending")
    .order("id", { ascending: true })
    .limit(limit);
  check("pending read", pErr);
  const rows = (pendingData ?? []) as { id: string; person_id: string | null; email: string; name: string }[];

  let sent = 0;
  let failed = 0;
  if (rows.length > 0) {
    const loaded = await loadBatchReport(pageId);
    const byPerson = new Map((loaded?.report.students ?? []).map((s) => [s.personId, s]));
    const optedOut = await listUnsubscribed(rows.map((r) => r.email));

    await pool(rows, CONCURRENCY, async (r) => {
      try {
        const { data: won, error: claimErr } = await admin
          .from("progress_report_recipients")
          .update({ state: "claimed", claimed_at: new Date().toISOString() })
          .eq("id", r.id)
          .eq("state", "pending")
          .select("id");
        if (claimErr || !won || won.length === 0) return; // another run has it
        const finish = async (patch: { state: string; reason?: string; sent_at?: string }) => {
          const tries = patch.state === "sent" ? 3 : 1;
          for (let n = 1; n <= tries; n++) {
            const { error } = await admin.from("progress_report_recipients").update(patch).eq("id", r.id);
            if (!error) return;
          }
        };
        const email = r.email.trim().toLowerCase();
        const student = r.person_id ? byPerson.get(r.person_id) : undefined;
        if (!email) return void (await finish({ state: "skipped", reason: "no_email" }));
        if (optedOut.has(email)) return void (await finish({ state: "skipped", reason: "unsubscribed" }));
        if (!loaded || !student) return void (await finish({ state: "skipped", reason: "No longer in this batch" }));
        let ok = false;
        let reason = "";
        try {
          const msg = renderReportEmail(loaded.report, student, await linksFor(loaded.report.slug, email));
          const res = await sendParticipantEmail({ to: email, toName: student.name, subject: msg.subject, htmlContent: msg.html });
          ok = res.ok;
          if (!res.ok) reason = res.error;
        } catch (e) {
          reason = e instanceof Error ? e.message : "Send failed";
        }
        if (ok) {
          sent += 1;
          await finish({ state: "sent", reason: "", sent_at: new Date().toISOString() });
        } else {
          failed += 1;
          await finish({ state: "failed", reason });
        }
      } catch {
        console.warn("[progress-reports] recipient run failed");
      }
    });
  }

  const { count, error: cErr } = await admin
    .from("progress_report_recipients")
    .select("id", { count: "exact", head: true })
    .eq("send_id", sendId)
    .eq("state", "pending");
  check("pending count", cErr);
  return { sent, failed, pending: count ?? 0 };
}

export async function retryReportFailed(sendId: string): Promise<number> {
  const { data, error } = await createAdminSupabase()
    .from("progress_report_recipients")
    .update({ state: "pending", reason: "", claimed_at: null })
    .eq("send_id", sendId)
    .eq("state", "failed")
    .select("id");
  check("retry", error);
  return (data ?? []).length;
}

export type ReportRound = {
  id: string;
  createdAt: string;
  total: number;
  counts: { sent: number; failed: number; skipped: number; waiting: number };
  recipients: { name: string; email: string; state: string; reason: string }[];
};

/** The latest rounds of a batch (newest first) with each student's state. Empty when the tables are missing. */
export async function listReportRounds(pageId: string, max = 5): Promise<ReportRound[]> {
  if (!UUID.test(pageId) || !(await reportTablesReady())) return [];
  const admin = createAdminSupabase();
  const { data: sends, error } = await admin
    .from("progress_report_sends")
    .select("id, created_at, recipient_count")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false })
    .limit(max);
  check("rounds read", error);
  const out: ReportRound[] = [];
  for (const s of (sends ?? []) as { id: string; created_at: string; recipient_count: number }[]) {
    const recipients = await fetchAll<{ name: string; email: string; state: string; reason: string }>("round recipients read", () =>
      admin.from("progress_report_recipients").select("name, email, state, reason").eq("send_id", s.id).order("id", { ascending: true }),
    );
    const counts = { sent: 0, failed: 0, skipped: 0, waiting: 0 };
    for (const r of recipients) {
      if (r.state === "sent") counts.sent += 1;
      else if (r.state === "failed") counts.failed += 1;
      else if (r.state === "skipped") counts.skipped += 1;
      else counts.waiting += 1;
    }
    out.push({ id: s.id, createdAt: s.created_at, total: s.recipient_count, counts, recipients });
  }
  return out;
}
