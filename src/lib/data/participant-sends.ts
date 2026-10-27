// src/lib/data/participant-sends.ts
// Admin-only. Sends to a landing page's participants. The recipient set is frozen at createSend;
// runEmailSend only ever sends to rows that createSend stored as pending.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import type { RegistrationListFilters } from "@/lib/data/landing-registration-admin";
import { resolveCandidates } from "@/lib/data/participant-campaigns";
import { getOrCreateToken, listUnsubscribed } from "@/lib/data/participant-prefs";
import { sendParticipantEmail } from "@/lib/brevo-participants";
import { planRecipients, summarize } from "@/lib/landing/participants/recipients";
import { renderParticipantTags, usesPortalLink, type SessionTagContext } from "@/lib/landing/participants/merge";
import { buildParticipantHtml } from "@/lib/landing/participants/email-html";
import type { Candidate, Channel, Summary } from "@/lib/landing/participants/types";
import { checkinSecret, signCheckinToken } from "@/lib/attendance/link-token";
import { formatPkt } from "@/lib/attendance/rules";
import { attendanceBase } from "@/lib/attendance/links";
import { getSessionById } from "@/lib/data/attendance";

export type SendRow = Tables<"participant_sends">;
export type SendRecipientRow = Tables<"participant_send_recipients">;

export type CreateSendFailureCode = "count_changed" | "not_paid_unconfirmed" | "no_recipients" | "no_course_for_portal_link" | "not_set_up" | "duplicate_send";
export type CreateSendResult =
  | { ok: true; sendId: string; count: number }
  | { ok: false; code: CreateSendFailureCode; message: string; summary?: Summary };

const CONCURRENCY = 5;
const STALE_CLAIM_MS = 15 * 60 * 1000;
const INSERT_CHUNK = 500;
const ID_CHUNK = 100;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";


const MESSAGES: Record<CreateSendFailureCode, string> = {
  count_changed: "The list changed. Review it again.",
  not_paid_unconfirmed: "Some people have not paid. Confirm to send anyway.",
  no_recipients: "Nobody to send to.",
  no_course_for_portal_link: "This campaign has no course, so the portal link cannot be used in the message.",
  not_set_up: "Email sending is not set up yet.",
  duplicate_send: "This message was just sent. Check Messages sent before sending again.",
};
const DUPLICATE_WINDOW_MS = 60 * 1000;
const MAY_HAVE_BEEN_SENT = "May have been sent. Check before sending again.";
const NO_PORTAL_LINK = "No portal link available";
const NO_PZ_ID = "No PZ ID yet";
const SESSION_DELETED = "Session was deleted";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads every row of a query by paging with range() until a short page. `build` must give a stable total order. */
async function fetchAllRows<T>(what: string, build: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    check(what, error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const fail = (code: CreateSendFailureCode, summary?: Summary): CreateSendResult => ({ ok: false, code, message: MESSAGES[code], summary });

/** Runs fn over items, at most `limit` at a time. fn must not throw. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/** `keep` narrows the resolved candidates before unsubscribed/missing-contact handling (used by session emails). */
export async function plan(input: { pageId: string; channel: Channel; ids?: string[]; filters?: RegistrationListFilters; keep?: (c: Candidate) => boolean }) {
  const resolved = await resolveCandidates({ pageId: input.pageId, ids: input.ids, filters: input.filters });
  const candidates = input.keep ? resolved.filter(input.keep) : resolved;
  const unsubscribed = input.channel === "email" ? await listUnsubscribed(candidates.map((c) => c.email).filter((e) => e.trim() !== "")) : new Set<string>();
  const planned = planRecipients(candidates, input.channel, unsubscribed);
  return { planned, summary: summarize(planned, input.channel) };
}

export async function previewSend(input: { pageId: string; channel: Channel; ids?: string[]; filters?: RegistrationListFilters }): Promise<{ summary: Summary; count: number }> {
  const { summary } = await plan(input);
  return { summary, count: summary.total };
}

async function pageCourseId(pageId: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("course_id").eq("id", pageId).maybeSingle();
  check("page read", error);
  return (data?.course_id as string | null | undefined) ?? null;
}

async function portalUrlFor(courseId: string | null): Promise<string | null> {
  if (!courseId) return null;
  const { data, error } = await createAdminSupabase().from("courses").select("slug").eq("id", courseId).maybeSingle();
  check("course read", error);
  const slug = data?.slug as string | null | undefined;
  return slug ? `${appUrl()}/portal/${slug}` : null;
}

export async function createSend(input: {
  pageId: string; channel: Channel; ids?: string[]; filters?: RegistrationListFilters;
  subject: string; body: string; templateId?: string | null; expectedCount: number; expectedNotPaid: number; confirmNotPaid: boolean; actorId: string;
}): Promise<CreateSendResult> {
  let resolved: Awaited<ReturnType<typeof plan>>;
  try {
    resolved = await plan(input);
  } catch (e) {
    // A ticked row stopped being a valid head since the preview (flagged or deleted): the list changed.
    if (e instanceof Error && /not on this campaign/i.test(e.message)) return fail("count_changed");
    throw e;
  }
  const { planned, summary } = resolved;
  if (planned.send.length !== input.expectedCount || summary.notPaid !== input.expectedNotPaid) return fail("count_changed", summary);
  if (summary.notPaid > 0 && !input.confirmNotPaid) return fail("not_paid_unconfirmed", summary);
  if (planned.send.length === 0) return fail("no_recipients", summary);
  if (usesPortalLink(input.body) || usesPortalLink(input.subject)) {
    // Same function that renders the link at send time.
    if ((await portalUrlFor(await pageCourseId(input.pageId))) === null) return fail("no_course_for_portal_link", summary);
  }
  if (input.channel === "email" && !process.env.BREVO_API_KEY_PARTICIPANTS) return fail("not_set_up", summary);

  const admin = createAdminSupabase();
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data: recent, error: recentErr } = await admin.from("participant_sends").select("subject, body")
    .eq("page_id", input.pageId).eq("channel", input.channel).gte("created_at", since);
  check("duplicate check", recentErr);
  // Compared here, not in the query: a long message in the URL would be refused.
  if ((recent ?? []).some((r) => r.subject === input.subject && r.body === input.body)) return fail("duplicate_send", summary);

  const { data: sendRow, error: sendErr } = await admin.from("participant_sends").insert({
    page_id: input.pageId,
    channel: input.channel,
    subject: input.subject,
    body: input.body,
    template_id: input.templateId ?? null,
    recipient_count: planned.send.length,
    not_paid_count: summary.notPaid,
    not_paid_confirmed: input.confirmNotPaid && summary.notPaid > 0,
    created_by: input.actorId,
  }).select("id").single();
  if (sendErr || !sendRow) throw new Error(`send insert failed: ${sendErr?.message ?? "no row"}`);
  const sendId = (sendRow as { id: string }).id;

  await freezeRecipients(sendId, planned);
  return { ok: true, sendId, count: planned.send.length };
}

/** Stores the recipient set of a send (pending and skipped rows). On failure the send row goes away and this throws. */
export async function freezeRecipients(sendId: string, planned: Awaited<ReturnType<typeof plan>>["planned"]): Promise<void> {
  const admin = createAdminSupabase();
  const toRow = (c: (typeof planned.send)[number], state: "pending" | "skipped", reason: string) => ({
    send_id: sendId, registration_id: c.registrationId, is_member: c.isMember, name: c.name, email: c.email, phone: c.phone,
    status_at_send: c.status, state, reason,
  });
  const rows = [
    ...planned.send.map((c) => toRow(c, "pending", "")),
    ...planned.skipped.map((s) => toRow(s.candidate, "skipped", s.reason)),
  ];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await admin.from("participant_send_recipients").insert(rows.slice(i, i + INSERT_CHUNK));
    if (error) {
      // Nothing may be left half-frozen: the send row (and its recipients, by cascade) goes away.
      const { error: delErr } = await admin.from("participant_sends").delete().eq("id", sendId);
      if (delErr) console.error(`[participant-sends] CLEANUP FAILED: send ${sendId} is left half-created (recipients missing). Delete it by hand. ${delErr.message}`);
      throw new Error(`recipient insert failed: ${error.message}`);
    }
  }
}

function renderEmail(send: { subject: string; body: string }, who: { name: string; refId: string; pzId: string }, portalUrl: string | null, unsubscribeUrl: string, session?: SessionTagContext) {
  const ctx = { name: who.name, refId: who.refId, portalUrl, pzId: who.pzId, ...(session ? { session } : {}) };
  // Body is plain text: tags render as text, buildParticipantHtml does the one HTML escape.
  const subject = renderParticipantTags(send.subject, ctx, "text");
  const html = buildParticipantHtml({ bodyText: renderParticipantTags(send.body, ctx, "text"), unsubscribeUrl });
  return { subject, html };
}

/** ref_id the message shows: members take their lead's. */
async function refIdsFor(registrationIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminSupabase();
  const out = new Map<string, string>();
  const ids = Array.from(new Set(registrationIds));
  const leadOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("landing_registrations").select("id, ref_id, lead_registration_id").in("id", ids.slice(i, i + ID_CHUNK));
    check("registrations read", error);
    for (const r of data ?? []) {
      out.set(r.id as string, (r.ref_id as string) ?? "");
      if (r.lead_registration_id) leadOf.set(r.id as string, r.lead_registration_id as string);
    }
  }
  const leadIds = Array.from(new Set(leadOf.values()));
  const leadRef = new Map<string, string>();
  for (let i = 0; i < leadIds.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("landing_registrations").select("id, ref_id").in("id", leadIds.slice(i, i + ID_CHUNK));
    check("leads read", error);
    for (const r of data ?? []) leadRef.set(r.id as string, (r.ref_id as string) ?? "");
  }
  for (const [id, lead] of Array.from(leadOf.entries())) if (leadRef.has(lead)) out.set(id, leadRef.get(lead)!);
  return out;
}

/** person_id of each registration (own person, members do not take their lead's). No person yet means no entry. */
async function personIdsFor(registrationIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminSupabase();
  const out = new Map<string, string>();
  const ids = Array.from(new Set(registrationIds));
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("landing_registrations").select("id, person_id").in("id", ids.slice(i, i + ID_CHUNK));
    check("registrations read", error);
    for (const r of data ?? []) if (r.person_id) out.set(r.id as string, r.person_id as string);
  }
  return out;
}

/** PZ ID the message shows: each registration's OWN person (members do not take their lead's). No person yet means no entry. */
async function pzIdsFor(registrationIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminSupabase();
  const out = new Map<string, string>();
  const ids = Array.from(new Set(registrationIds));
  const personOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("landing_registrations").select("id, person_id").in("id", ids.slice(i, i + ID_CHUNK));
    check("registrations read", error);
    for (const r of data ?? []) if (r.person_id) personOf.set(r.id as string, r.person_id as string);
  }
  const personIds = Array.from(new Set(personOf.values()));
  const pzOf = new Map<string, string>();
  for (let i = 0; i < personIds.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("pz_people").select("id, pz_id").in("id", personIds.slice(i, i + ID_CHUNK));
    check("people read", error);
    for (const p of data ?? []) if (p.pz_id) pzOf.set(p.id as string, p.pz_id as string);
  }
  for (const [regId, personId] of Array.from(personOf.entries())) {
    const pz = pzOf.get(personId);
    if (pz) out.set(regId, pz);
  }
  return out;
}

export async function runEmailSend(sendId: string, limit = 40): Promise<{ sent: number; failed: number; pending: number }> {
  const admin = createAdminSupabase();
  const { data: send, error: sendErr } = await admin.from("participant_sends").select("*").eq("id", sendId).maybeSingle();
  check("send read", sendErr);
  if (!send || send.channel !== "email") return { sent: 0, failed: 0, pending: 0 };

  // A run that died mid-way leaves rows claimed. The email may or may not have gone out, so after
  // 15 minutes they become failed (never pending): nothing is re-sent automatically, the owner decides via retryFailed.
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { error: staleErr } = await admin.from("participant_send_recipients")
    .update({ state: "failed", reason: MAY_HAVE_BEEN_SENT }).eq("send_id", sendId).eq("state", "claimed").lt("claimed_at", cutoff);
  check("stale claim reset", staleErr);

  const { data: pendingData, error: pendErr } = await admin.from("participant_send_recipients")
    .select("*").eq("send_id", sendId).eq("state", "pending").order("id", { ascending: true }).limit(limit);
  check("pending read", pendErr);
  const pendingRows = (pendingData ?? []) as SendRecipientRow[];

  // A session send whose session was deleted since (session_id set null by the FK) would show raw session tags: skip it all.
  const isSessionSend = !!send.session_id || !!send.session_kind;
  const session = send.session_id ? await getSessionById(send.session_id) : null;
  if (isSessionSend && !session) {
    if (pendingRows.length > 0) {
      const { error: skipErr } = await admin.from("participant_send_recipients")
        .update({ state: "skipped", reason: SESSION_DELETED }).eq("send_id", sendId).eq("state", "pending");
      check("session deleted skip", skipErr);
    }
    return { sent: 0, failed: 0, pending: 0 };
  }

  const portalUrl = await portalUrlFor(await pageCourseId(send.page_id));
  const optedOut = await listUnsubscribed(pendingRows.map((r) => r.email).filter((e) => e.trim() !== ""));
  const refIds = await refIdsFor(pendingRows.map((r) => r.registration_id));
  const pzIds = await pzIdsFor(pendingRows.map((r) => r.registration_id));

  // Session sends: the session is read once per run; each person gets their own signed attendance link.
  const secret = session ? checkinSecret() : null;
  const personIds = session ? await personIdsFor(pendingRows.map((r) => r.registration_id)) : new Map<string, string>();
  const sessionCtxFor = (registrationId: string): SessionTagContext | undefined => {
    if (!session) return undefined;
    const shared = `${attendanceBase()}/attend/${session.public_code}`;
    const personId = personIds.get(registrationId);
    // No person or no signing secret: the shared link (never a token signed with an empty key).
    const attendanceUrl = personId && secret ? `${shared}?t=${signCheckinToken(session.id, personId, secret)}` : shared;
    return { zoomUrl: session.zoom_url, kahootUrl: session.include_kahoot ? session.kahoot_url : "", timeText: formatPkt(session.starts_at), attendanceUrl };
  };

  let sent = 0, failed = 0;
  await pool(pendingRows, CONCURRENCY, async (r) => {
    try {
      const { data: won, error: claimErr } = await admin.from("participant_send_recipients")
        .update({ state: "claimed", claimed_at: new Date().toISOString() })
        .eq("id", r.id).eq("state", "pending").select("id");
      if (claimErr || !won || won.length === 0) return; // someone else has it
      const finish = async (patch: Partial<SendRecipientRow>) => {
        // The email already went out when state is "sent": retry the mark so it is not later seen as stale.
        const attempts = patch.state === "sent" ? 3 : 1;
        for (let n = 1; n <= attempts; n++) {
          const { error } = await admin.from("participant_send_recipients").update(patch).eq("id", r.id);
          if (!error) return;
          if (n < attempts) await sleep(100 * n);
        }
        // Stays claimed; after 15 minutes it turns failed ("may have been sent"), never pending.
        console.warn("[participant-sends] state update failed");
      };
      const email = r.email.trim().toLowerCase();
      if (email === "") { await finish({ state: "skipped", reason: "no_email" }); return; }
      if (optedOut.has(email)) { await finish({ state: "skipped", reason: "unsubscribed" }); return; }
      if ((usesPortalLink(send.body) || usesPortalLink(send.subject)) && portalUrl === null) {
        failed += 1;
        await finish({ state: "failed", reason: NO_PORTAL_LINK });
        return;
      }
      if (session && !pzIds.get(r.registration_id)) {
        failed += 1;
        await finish({ state: "failed", reason: NO_PZ_ID });
        return;
      }
      let result: { ok: true } | { ok: false; error: string };
      try {
        const token = await getOrCreateToken(email);
        const msg = renderEmail(send, { name: r.name, refId: refIds.get(r.registration_id) ?? "", pzId: pzIds.get(r.registration_id) ?? "" }, portalUrl, `${appUrl()}/unsubscribe/participants/${token}`, sessionCtxFor(r.registration_id));
        result = await sendParticipantEmail({ to: r.email, toName: r.name, subject: msg.subject, htmlContent: msg.html });
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : "Send failed" };
      }
      if (result.ok) { sent += 1; await finish({ state: "sent", sent_at: new Date().toISOString(), reason: "" }); }
      else { failed += 1; await finish({ state: "failed", reason: result.error }); }
    } catch {
      console.warn("[participant-sends] recipient run failed");
    }
  });

  const { count, error: cErr } = await admin.from("participant_send_recipients")
    .select("id", { count: "exact", head: true }).eq("send_id", sendId).eq("state", "pending");
  check("pending count", cErr);
  return { sent, failed, pending: count ?? 0 };
}

export async function retryFailed(sendId: string): Promise<number> {
  const { data, error } = await createAdminSupabase().from("participant_send_recipients")
    .update({ state: "pending", reason: "", claimed_at: null }).eq("send_id", sendId).eq("state", "failed").select("id");
  check("retry", error);
  return (data ?? []).length;
}

export async function markWhatsAppSent(sendId: string, recipientId: string, sent: boolean): Promise<void> {
  const admin = createAdminSupabase();
  const { data: send, error: sErr } = await admin.from("participant_sends").select("channel").eq("id", sendId).maybeSingle();
  check("send read", sErr);
  if (!send || send.channel !== "whatsapp") throw new Error("Not a WhatsApp send");
  const patch = sent ? { state: "sent", sent_at: new Date().toISOString() } : { state: "pending", sent_at: null };
  const { data, error } = await admin.from("participant_send_recipients").update(patch)
    .eq("id", recipientId).eq("send_id", sendId).in("state", ["pending", "sent"]).select("id");
  check("whatsapp mark", error);
  if (!data || data.length === 0) throw new Error("Recipient not found");
}

export async function listSends(pageId: string): Promise<SendRow[]> {
  return fetchAllRows<SendRow>("sends read", () =>
    createAdminSupabase().from("participant_sends").select("*").eq("page_id", pageId)
      .order("created_at", { ascending: false }).order("id", { ascending: true }));
}

export type SendCounts = { sent: number; failed: number; skipped: number; waiting: number };
/** A send as the "Messages sent" list shows it: the row, who sent it (null when no name is known) and its recipients counted by state. */
export type SendListItem = SendRow & { senderName: string | null; counts: SendCounts };

/** listSends plus counts per state (claimed counts as waiting) and the sender's name. Read in chunks, like the rest of this file. */
export async function listSendSummaries(pageId: string): Promise<SendListItem[]> {
  const admin = createAdminSupabase();
  const sends = await listSends(pageId);
  const counts = new Map<string, SendCounts>(sends.map((s) => [s.id, { sent: 0, failed: 0, skipped: 0, waiting: 0 }]));
  for (let i = 0; i < sends.length; i += ID_CHUNK) {
    const part = sends.slice(i, i + ID_CHUNK).map((s) => s.id);
    const rows = await fetchAllRows<{ send_id: string; state: string }>("send counts read", () =>
      admin.from("participant_send_recipients").select("send_id, state").in("send_id", part).order("id", { ascending: true }));
    for (const r of rows) {
      const c = counts.get(r.send_id);
      if (!c) continue;
      if (r.state === "sent") c.sent += 1;
      else if (r.state === "failed") c.failed += 1;
      else if (r.state === "skipped") c.skipped += 1;
      else c.waiting += 1;
    }
  }
  const actorIds = Array.from(new Set(sends.map((s) => s.created_by).filter((v): v is string => !!v)));
  const names = new Map<string, string>();
  for (let i = 0; i < actorIds.length; i += ID_CHUNK) {
    const { data, error } = await admin.from("profiles").select("id, full_name").in("id", actorIds.slice(i, i + ID_CHUNK));
    check("senders read", error);
    for (const p of data ?? []) if (p.full_name) names.set(p.id as string, p.full_name as string);
  }
  return sends.map((s) => ({ ...s, senderName: s.created_by ? names.get(s.created_by) ?? null : null, counts: counts.get(s.id)! }));
}

export type SendDetail = {
  send: SendRow;
  recipients: SendRecipientRow[];
  /** registration id -> the ref id its message shows (members take their lead's). */
  refIds: Record<string, string>;
  /** registration id -> its own person's PZ ID (absent when no person yet). */
  pzIds: Record<string, string>;
  /** The campaign's portal link, or null when it has no course. */
  portalUrl: string | null;
};

export async function getSend(sendId: string): Promise<SendDetail | null> {
  const admin = createAdminSupabase();
  const { data: send, error } = await admin.from("participant_sends").select("*").eq("id", sendId).maybeSingle();
  check("send read", error);
  if (!send) return null;
  const recipients = await fetchAllRows<SendRecipientRow>("recipients read", () =>
    admin.from("participant_send_recipients").select("*").eq("send_id", sendId)
      .order("name", { ascending: true }).order("id", { ascending: true }));
  const refIds = Object.fromEntries(await refIdsFor(recipients.map((r) => r.registration_id)));
  const pzIds = Object.fromEntries(await pzIdsFor(recipients.map((r) => r.registration_id)));
  const portalUrl = await portalUrlFor(await pageCourseId((send as SendRow).page_id));
  return { send: send as SendRow, recipients, refIds, pzIds, portalUrl };
}

export async function listMessagesForRegistrations(registrationIds: string[]): Promise<{ registrationId: string; channel: string; subject: string; state: string; sentAt: string | null; sendCreatedAt: string | null }[]> {
  const admin = createAdminSupabase();
  const ids = Array.from(new Set(registrationIds));
  const out: { registrationId: string; channel: string; subject: string; state: string; sentAt: string | null; sendCreatedAt: string | null }[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const part = ids.slice(i, i + ID_CHUNK);
    const rows = await fetchAllRows<SendRecipientRow>("messages read", () =>
      admin.from("participant_send_recipients").select("*").in("registration_id", part).order("id", { ascending: true }));
    if (rows.length === 0) continue;
    const sendIds = Array.from(new Set(rows.map((r) => r.send_id)));
    const byId = new Map<string, SendRow>();
    for (let k = 0; k < sendIds.length; k += ID_CHUNK) {
      const { data: sends, error: sErr } = await admin.from("participant_sends").select("*").in("id", sendIds.slice(k, k + ID_CHUNK));
      check("messages sends read", sErr);
      for (const s of (sends ?? []) as SendRow[]) byId.set(s.id, s);
    }
    for (const r of rows) {
      const s = byId.get(r.send_id);
      if (!s) continue;
      out.push({ registrationId: r.registration_id, channel: s.channel, subject: s.subject, state: r.state, sentAt: r.sent_at, sendCreatedAt: s.created_at });
    }
  }
  return out.sort((a, b) => (b.sendCreatedAt ?? "").localeCompare(a.sendCreatedAt ?? ""));
}

export async function sendTestToMe(input: { subject: string; body: string; toEmail: string; pageId: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const portalUrl = await portalUrlFor(await pageCourseId(input.pageId));
    const msg = renderEmail(input, { name: "Sample Person", refId: "REF-SAMPLE", pzId: "Sample-0000" }, portalUrl, `${appUrl()}/unsubscribe/participants/preview`);
    const res = await sendParticipantEmail({ to: input.toEmail, subject: `[TEST] ${msg.subject}`, htmlContent: msg.html });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
