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
import { renderParticipantTags, usesPortalLink } from "@/lib/landing/participants/merge";
import { buildParticipantHtml } from "@/lib/landing/participants/email-html";
import type { Channel, Summary } from "@/lib/landing/participants/types";

export type SendRow = Tables<"participant_sends">;
export type SendRecipientRow = Tables<"participant_send_recipients">;

export type CreateSendFailureCode = "count_changed" | "not_paid_unconfirmed" | "no_recipients" | "no_course_for_portal_link" | "not_set_up";
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
};
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

async function plan(input: { pageId: string; channel: Channel; ids?: string[]; filters?: RegistrationListFilters }) {
  const candidates = await resolveCandidates({ pageId: input.pageId, ids: input.ids, filters: input.filters });
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
  subject: string; body: string; templateId?: string | null; expectedCount: number; confirmNotPaid: boolean; actorId: string;
}): Promise<CreateSendResult> {
  const { planned, summary } = await plan(input);
  if (planned.send.length !== input.expectedCount) return fail("count_changed", summary);
  if (summary.notPaid > 0 && !input.confirmNotPaid) return fail("not_paid_unconfirmed", summary);
  if (planned.send.length === 0) return fail("no_recipients", summary);
  if (usesPortalLink(input.body) || usesPortalLink(input.subject)) {
    if (!(await pageCourseId(input.pageId))) return fail("no_course_for_portal_link", summary);
  }
  if (input.channel === "email" && !process.env.BREVO_API_KEY_PARTICIPANTS) return fail("not_set_up", summary);

  const admin = createAdminSupabase();
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
      await admin.from("participant_sends").delete().eq("id", sendId);
      throw new Error(`recipient insert failed: ${error.message}`);
    }
  }
  return { ok: true, sendId, count: planned.send.length };
}

function renderEmail(send: { subject: string; body: string }, who: { name: string; refId: string }, portalUrl: string | null, unsubscribeUrl: string) {
  const ctx = { name: who.name, refId: who.refId, portalUrl };
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

export async function runEmailSend(sendId: string, limit = 40): Promise<{ sent: number; failed: number; pending: number }> {
  const admin = createAdminSupabase();
  const { data: send, error: sendErr } = await admin.from("participant_sends").select("*").eq("id", sendId).maybeSingle();
  check("send read", sendErr);
  if (!send || send.channel !== "email") return { sent: 0, failed: 0, pending: 0 };

  // A run that died mid-way leaves rows claimed; after 15 minutes they count as pending again.
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { error: staleErr } = await admin.from("participant_send_recipients")
    .update({ state: "pending", claimed_at: null }).eq("send_id", sendId).eq("state", "claimed").lt("claimed_at", cutoff);
  check("stale claim reset", staleErr);

  const { data: pendingData, error: pendErr } = await admin.from("participant_send_recipients")
    .select("*").eq("send_id", sendId).eq("state", "pending").order("id", { ascending: true }).limit(limit);
  check("pending read", pendErr);
  const pendingRows = (pendingData ?? []) as SendRecipientRow[];

  const portalUrl = await portalUrlFor(await pageCourseId(send.page_id));
  const optedOut = await listUnsubscribed(pendingRows.map((r) => r.email).filter((e) => e.trim() !== ""));
  const refIds = await refIdsFor(pendingRows.map((r) => r.registration_id));

  let sent = 0, failed = 0;
  await pool(pendingRows, CONCURRENCY, async (r) => {
    try {
      const { data: won, error: claimErr } = await admin.from("participant_send_recipients")
        .update({ state: "claimed", claimed_at: new Date().toISOString() })
        .eq("id", r.id).eq("state", "pending").select("id");
      if (claimErr || !won || won.length === 0) return; // someone else has it
      const finish = async (patch: Partial<SendRecipientRow>) => {
        const { error } = await admin.from("participant_send_recipients").update(patch).eq("id", r.id);
        if (error) console.warn("[participant-sends] state update failed"); // stays claimed: still blocks a resend
      };
      const email = r.email.trim().toLowerCase();
      if (email === "") { await finish({ state: "skipped", reason: "no_email" }); return; }
      if (optedOut.has(email)) { await finish({ state: "skipped", reason: "unsubscribed" }); return; }
      let result: { ok: true } | { ok: false; error: string };
      try {
        const token = await getOrCreateToken(email);
        const msg = renderEmail(send, { name: r.name, refId: refIds.get(r.registration_id) ?? "" }, portalUrl, `${appUrl()}/unsubscribe/participants/${token}`);
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
  const { error } = await admin.from("participant_send_recipients").update(patch)
    .eq("id", recipientId).eq("send_id", sendId).in("state", sent ? ["pending"] : ["sent"]);
  check("whatsapp mark", error);
}

export async function listSends(pageId: string): Promise<SendRow[]> {
  const { data, error } = await createAdminSupabase().from("participant_sends").select("*").eq("page_id", pageId).order("created_at", { ascending: false });
  check("sends read", error);
  return (data ?? []) as SendRow[];
}

export async function getSend(sendId: string): Promise<{ send: SendRow; recipients: SendRecipientRow[] } | null> {
  const admin = createAdminSupabase();
  const { data: send, error } = await admin.from("participant_sends").select("*").eq("id", sendId).maybeSingle();
  check("send read", error);
  if (!send) return null;
  const recipients: SendRecipientRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: rErr } = await admin.from("participant_send_recipients").select("*").eq("send_id", sendId)
      .order("name", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    check("recipients read", rErr);
    recipients.push(...((data ?? []) as SendRecipientRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return { send: send as SendRow, recipients };
}

export async function listMessagesForRegistrations(registrationIds: string[]): Promise<{ registrationId: string; channel: string; subject: string; state: string; sentAt: string | null; sendCreatedAt: string | null }[]> {
  const admin = createAdminSupabase();
  const ids = Array.from(new Set(registrationIds));
  const out: { registrationId: string; channel: string; subject: string; state: string; sentAt: string | null; sendCreatedAt: string | null }[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data: recs, error } = await admin.from("participant_send_recipients").select("*").in("registration_id", ids.slice(i, i + ID_CHUNK));
    check("messages read", error);
    const rows = (recs ?? []) as SendRecipientRow[];
    if (rows.length === 0) continue;
    const sendIds = Array.from(new Set(rows.map((r) => r.send_id)));
    const { data: sends, error: sErr } = await admin.from("participant_sends").select("*").in("id", sendIds);
    check("messages sends read", sErr);
    const byId = new Map(((sends ?? []) as SendRow[]).map((s) => [s.id, s]));
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
    const msg = renderEmail(input, { name: "Sample Person", refId: "REF-SAMPLE" }, portalUrl, `${appUrl()}/unsubscribe/participants/preview`);
    const res = await sendParticipantEmail({ to: input.toEmail, subject: `[TEST] ${msg.subject}`, htmlContent: msg.html });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
