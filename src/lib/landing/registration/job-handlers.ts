import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getRegistrationBundle, markEmailStatus, type RegistrationBundle, type RegistrationRecord } from "@/lib/data/landing-registrations";
import { getRegistrablePageById, type RegistrablePage } from "@/lib/data/landing-public";
import { saveContactSnapshots, saveSnapshots, saveStatusSnapshots } from "@/lib/data/landing-sheet-sync";
import { listPaymentAccounts } from "@/lib/data/landing-payment-accounts";
import { appendRegistrationRows, applyRegistrationDetails, applyRegistrationStatus } from "@/lib/gas/event-sheet-client";
import { STATUS_LABELS, toSheetRow, type SheetRegistration } from "./sheet-row";
import {
  buildAdminAlertEmail, buildFreeJoiningEmail, buildMemberReceivedEmail, buildReceivedEmail,
  buildVoucherResubmittedEmail, withTestPrefix, type BuiltEmail, type LandingEmailContext,
} from "@/lib/emails/landing-registration";
import { buildStatusEmail, emailContext } from "./status-email";
import { manualKindsFor, RECEIVED_SENT, type ManualEmailKind } from "./manual-kinds";
import { resolveAccess, syncEnrollmentForRegistration } from "@/lib/data/landing-enrollment";
import { claimEmail, lastSentAt, logManualEmail, markEmailSent, releaseEmail } from "@/lib/data/landing-email-log";
import { claimMetaPurchase, firstPaidAt, markMetaPurchaseSent, markMetaPurchaseSkipped, releaseMetaPurchase } from "@/lib/data/landing-meta-events";
import { buildPurchaseEvent, isTooOld } from "@/lib/meta/capi-payload";
import { sendMetaEvent } from "@/lib/meta/capi-client";
import type { JobType } from "@/lib/data/landing-jobs";

export { RECEIVED_SENT };

type Loaded = { bundle: RegistrationBundle; page: RegistrablePage };

async function load(registrationId: string): Promise<Loaded | null> {
  const bundle = await getRegistrationBundle(registrationId);
  if (!bundle) return null;
  const page = await getRegistrablePageById(bundle.lead.pageId);
  return page ? { bundle, page } : null;
}

async function agentNameFor(agentId: string | null): Promise<string> {
  if (!agentId) return "";
  const { data } = await createAdminSupabase().from("profiles").select("full_name").eq("id", agentId).maybeSingle();
  return data?.full_name ?? "";
}

/** Test mode (ruling 2): mail only the admin who ran the test (stored as the test row's student_id). */
async function testRecipient(lead: RegistrationRecord): Promise<string | null> {
  if (!lead.studentId) return null;
  const { data } = await createAdminSupabase().auth.admin.getUserById(lead.studentId);
  return data?.user?.email ?? null;
}

/** True when an email was handed to Brevo; false when a test registration has no admin address to receive it. */
async function deliver(lead: RegistrationRecord, intendedTo: string, toName: string, email: BuiltEmail): Promise<boolean> {
  const to = lead.isTest ? await testRecipient(lead) : intendedTo;
  if (!to) return false;
  const final = lead.isTest ? withTestPrefix(email) : email;
  await sendTransactionalEmail({ to, toName, subject: final.subject, htmlContent: final.html });
  return true;
}

const sheetUrl = (page: RegistrablePage) => (page.sheetId ? `https://docs.google.com/spreadsheets/d/${page.sheetId}/edit` : "");

/**
 * One database row -> Part A's SheetRegistration (Task 5). Members carry the lead's ref and
 * email (ruling 1) and no payment method; the whole-registration total rides on every row
 * (toSheetRow blanks it on member rows). `paymentMethodLabel` is the lead's account label.
 */
export function toSheetRegistration(
  r: RegistrationRecord,
  lead: RegistrationRecord,
  page: RegistrablePage,
  agentName: string,
  paymentMethodLabel: string,
): SheetRegistration {
  return {
    rowType: r.rowType,
    name: r.name,
    email: r.email,
    whatsapp: r.whatsapp,
    profession: r.profession,
    discovery: r.discovery,
    optionLabel: r.optionLabel,
    promoCodeText: r.promoCodeText ?? "",
    promoCodeUsed: lead.promoCodeText ?? "",
    voucherUrl: r.voucherUrl ?? "",
    submittedAt: r.createdAt,
    expectedAmount: lead.expectedAmount ?? 0,
    currency: lead.currency,
    groupLeadEmail: lead.email,
    paymentMethodLabel: r.rowType === "member" ? "" : paymentMethodLabel,
    amountReceived: r.amountReceived,
    status: r.status,
    emailStatus: r.emailStatus ?? "",
    source: `landing:${page.slug}`,
    refId: lead.refId ?? "",
    regionKey: lead.region,
    agentName,
    utmCampaign: lead.utm.utm_campaign ?? "",
    variantKey: lead.variantKey,
  };
}

async function sheetAppend(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { bundle, page } = loaded;
  if (bundle.lead.isTest || !page.sheetId) return; // nothing to write: done, not failed
  const agentName = await agentNameFor(bundle.lead.agentId);
  const method = bundle.lead.paymentMethod ?? "";
  const accounts = method ? await listPaymentAccounts([method]) : [];
  const paymentMethodLabel = accounts[0]?.label ?? method;
  const rows = [bundle.lead, ...bundle.members].map((r) =>
    toSheetRow(toSheetRegistration(r, bundle.lead, page, agentName, paymentMethodLabel)),
  );
  const res = await appendRegistrationRows(page.sheetId, rows);
  if (!res.ok) throw new Error(res.message ?? "Sheet append failed");
  // Remember what we just wrote so a later sheet scan can tell a sheet edit from an app edit.
  await saveSnapshots([bundle.lead, ...bundle.members].map((r) => ({
    id: r.id, status: r.status, amountReceived: r.amountReceived, name: r.name, email: r.email, whatsapp: r.whatsapp,
  })));
}

/** Pushes the current status to the sheet rows of the whole bundle. Skipped for tests and pages without a sheet. */
async function sheetStatus(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { bundle, page } = loaded;
  if (bundle.lead.isTest || !page.sheetId) return;
  const people = [bundle.lead, ...bundle.members];
  // The sheet row is found by the email the sheet currently shows: the remembered snapshot email when there is
  // one (an in-app email edit may not have reached the sheet yet), else the current email.
  const { data: snaps, error: snapErr } = await createAdminSupabase()
    .from("landing_sheet_snapshots").select("registration_id, email").in("registration_id", people.map((r) => r.id));
  if (snapErr) throw new Error("Sheet snapshot lookup failed");
  const snapEmail = new Map<string, string>();
  for (const s of (snaps ?? []) as { registration_id: string; email: string | null }[]) {
    const e = s.email?.trim();
    if (e) snapEmail.set(s.registration_id, e);
  }
  const matchEmailOf = (r: { id: string; email: string }) => snapEmail.get(r.id) ?? r.email;
  const rows = people.map((r) => ({
    refId: bundle.lead.refId ?? "",
    email: matchEmailOf(r),
    // The script only knows the sheet words ("Paid"), not the database words ("paid").
    status: STATUS_LABELS[r.status],
    amountReceived: r.amountReceived,
  }));
  const res = await applyRegistrationStatus(page.sheetId, rows);
  if (!res.ok) throw new Error("Sheet status update failed");
  // Only status and amount: a status push must not overwrite the stored name/email/WhatsApp snapshot.
  // A row the script could not find was not rewritten, so its remembered value must stay as it was (sheet == snapshot).
  const missing = new Set((res.missing ?? []).map((k) => k.trim()));
  const keyOf = (r: { id: string; email: string }) => `${(bundle.lead.refId ?? "").trim().toUpperCase()}|${matchEmailOf(r).trim().toLowerCase()}`;
  await saveStatusSnapshots(
    people
      .filter((r) => !missing.has(keyOf(r)))
      .map((r) => ({ id: r.id, status: r.status, amountReceived: r.amountReceived })),
  );
}

/**
 * Pushes one person's edited name, email and WhatsApp onto their sheet row. The row is found by the lead's
 * Ref ID + the email the sheet currently shows (the remembered snapshot email; the current email if none).
 * Only the contact snapshot moves, and only after the row was found: status/amount are never touched here.
 */
async function sheetDetails(registrationId: string): Promise<void> {
  // getRegistrationBundle treats its argument as the LEAD id. For a member it returns the member as a
  // lead-shaped head, so resolve the real lead first and read the group from there (members carry no ref).
  let bundle = await getRegistrationBundle(registrationId);
  if (!bundle) return;
  const leadId = bundle.lead.leadRegistrationId;
  if (leadId) {
    bundle = await getRegistrationBundle(leadId);
    if (!bundle) return;
  }
  const page = await getRegistrablePageById(bundle.lead.pageId);
  if (!page) return;
  if (bundle.lead.isTest || !page.sheetId) return;
  const person = [bundle.lead, ...bundle.members].find((r) => r.id === registrationId);
  if (!person || person.isTest) return;
  const { data: snap, error } = await createAdminSupabase()
    .from("landing_sheet_snapshots").select("email").eq("registration_id", registrationId).maybeSingle();
  if (error) throw new Error("Sheet snapshot lookup failed");
  const refId = bundle.lead.refId ?? "";
  const snapEmail = snap?.email?.trim() || person.email;
  const keyFor = (email: string) => `${refId.trim().toUpperCase()}|${email.trim().toLowerCase()}`;
  const push = async (matchEmail: string): Promise<boolean> => {
    const res = await applyRegistrationDetails(page.sheetId!, [
      { refId, matchEmail, name: person.name, email: person.email, whatsapp: person.whatsapp },
    ]);
    if (!res.ok) throw new Error("Sheet details update failed");
    return !(res.missing ?? []).some((k) => k.trim() === keyFor(matchEmail));
  };
  let found = await push(snapEmail);
  // A lost reply or a failed snapshot save leaves the sheet already showing the new email: try that once.
  if (!found && snapEmail.trim().toLowerCase() !== person.email.trim().toLowerCase()) found = await push(person.email);
  if (!found) throw new Error("Sheet row not found for the details update");
  await saveContactSnapshots([{ id: person.id, name: person.name, email: person.email, whatsapp: person.whatsapp }]);
}

async function emailReceived(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { lead } = loaded.bundle;
  if (lead.emailStatus === RECEIVED_SENT) return;
  const ctx = await emailContext(lead, loaded.page);
  const email = lead.status === "free" ? buildFreeJoiningEmail(ctx) : buildReceivedEmail(ctx);
  await deliver(lead, lead.email, lead.name, email);
  await markEmailStatus(lead.id, RECEIVED_SENT);
}

async function emailMembers(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { lead, members } = loaded.bundle;
  const pending = members.filter((mem) => mem.emailStatus !== RECEIVED_SENT);
  if (pending.length === 0) return;
  const base = await emailContext(lead, loaded.page);
  let firstError: Error | null = null;
  for (const member of pending) {
    try {
      const ctx = { ...base, name: member.name, accounts: [] };
      const email = lead.status === "free" ? buildFreeJoiningEmail(ctx) : buildMemberReceivedEmail({ ...ctx, leadName: lead.name });
      await deliver(lead, member.email, member.name, email);
      await markEmailStatus(member.id, RECEIVED_SENT);
    } catch (err) {
      if (!firstError) firstError = err instanceof Error ? err : new Error("member email failed");
    }
  }
  if (firstError) throw firstError;
}

async function emailAdmin(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { lead, members } = loaded.bundle;
  const adminTo = process.env.LANDING_ADMIN_EMAIL ?? "";
  if (!lead.isTest && !adminTo) {
    console.warn("[landing-jobs] LANDING_ADMIN_EMAIL is not set; admin alert skipped");
    return;
  }
  const ctx = await emailContext(lead, loaded.page);
  const email = buildAdminAlertEmail({
    ...ctx,
    email: lead.email,
    whatsapp: lead.whatsapp,
    profession: lead.profession,
    city: lead.city,
    discovery: lead.discovery,
    paymentMethod: lead.paymentMethod ?? "",
    promoCode: lead.promoCodeText ?? "",
    voucherUrl: lead.voucherUrl ?? "",
    members: members.map((mem) => ({ name: mem.name, email: mem.email, whatsapp: mem.whatsapp, profession: mem.profession })),
    sheetUrl: sheetUrl(loaded.page),
    agentName: await agentNameFor(lead.agentId),
    utmCampaign: lead.utm.utm_campaign ?? "",
    isFree: lead.status === "free",
  });
  await deliver(lead, adminTo, "PZ Academy", email);
}

const STATUS_EMAIL_KIND: Partial<Record<RegistrationRecord["status"], "paid" | "underpaid" | "reserved">> = { paid: "paid", underpaid: "underpaid", reserved: "reserved" };

/** Brings enrollments in line with each person's status. Tries everyone, then rethrows the first error so the job retries. */
async function enrollmentSync(registrationId: string): Promise<void> {
  const bundle = await getRegistrationBundle(registrationId);
  if (!bundle) return;
  let firstError: unknown = null;
  for (const person of [bundle.lead, ...bundle.members]) {
    try {
      await syncEnrollmentForRegistration(person.id);
    } catch (err) {
      if (!firstError) firstError = err;
    }
  }
  if (firstError) throw firstError;
}

/**
 * One Paid / Underpaid / Reserved email per person (lead and members independently), guarded by the
 * sent-once log. Pending and Free get nothing here: the "received" email is their email.
 */
async function emailStatus(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { lead, members } = loaded.bundle;
  let base: LandingEmailContext | null = null;
  let firstError: unknown = null;
  for (const person of [lead, ...members]) {
    const kind = STATUS_EMAIL_KIND[person.status];
    if (!kind) continue;
    // The lead pays the group fee and members already got the received email: only Paid goes to members.
    if (person.rowType === "member" && kind !== "paid") continue;
    let claimed = false;
    try {
      claimed = await claimEmail(person.id, kind, person.email);
    } catch (err) {
      if (!firstError) firstError = err;
      continue;
    }
    if (!claimed) continue;
    try {
      base ??= await emailContext(lead, loaded.page);
      const access = await resolveAccess(person.id);
      if (!access) throw new Error("registration access could not be resolved");
      if (STATUS_EMAIL_KIND[access.registration.status] !== kind) {
        // Status moved since the bundle was read: the newer enqueue handles the current status.
        await releaseEmail(person.id, kind);
        continue;
      }
      const email = await buildStatusEmail({ kind, person, lead, page: loaded.page, asOf: "now", base, access });
      await deliver(lead, person.email, person.name, email);
    } catch (err) {
      try { await releaseEmail(person.id, kind); } catch { console.warn("[landing-jobs] email claim release failed"); }
      if (!firstError) firstError = err;
      continue;
    }
    // The email went out. If the log update fails the row stays 'claimed' (still blocks a resend).
    try { await markEmailSent(person.id, kind); } catch { console.warn("[landing-jobs] email sent mark failed"); }
  }
  if (firstError) throw firstError;
}

/**
 * One Meta Purchase per registration, ever, on the first Paid. A group sends one event for the lead row at the
 * lead's own amount; members never fire. The claim row (primary key = registration id) decides who sends.
 */
async function metaPurchase(registrationId: string): Promise<void> {
  const loaded = await load(registrationId);
  if (!loaded) return;
  const { lead } = loaded.bundle;
  const { page } = loaded;
  if (lead.isTest || lead.status !== "paid" || lead.rowType === "member") return;

  // RegistrationRecord does not carry the Meta cookies: read them directly.
  const { data: cookies, error: cookieErr } = await createAdminSupabase()
    .from("landing_registrations").select("fbp, fbc").eq("id", lead.id).maybeSingle();
  if (cookieErr) throw new Error("Meta cookie lookup failed");

  const paidAt = (await firstPaidAt(lead.id)) ?? lead.statusChangedAt ?? lead.createdAt;
  const eventId = `purchase-${lead.id}`;
  if (isTooOld(paidAt, new Date())) {
    if (await claimMetaPurchase(lead.id, eventId)) await markMetaPurchaseSkipped(lead.id, "older than 7 days");
    return;
  }

  if (!(await claimMetaPurchase(lead.id, eventId))) return; // already sent, skipped or being sent

  const release = async () => {
    try { await releaseMetaPurchase(lead.id); } catch { console.warn("[landing-jobs] meta purchase claim release failed"); }
  };
  try {
    const pixelId = page.registration.pixelId || process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
    if (!pixelId) throw new Error("Meta Pixel ID not set");
    const value = lead.amountReceived ?? lead.expectedAmount ?? 0;
    if (value <= 0) throw new Error("Meta Purchase has no amount");
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://pharmacozyme.com";
    const event = buildPurchaseEvent({
      registrationId: lead.id, email: lead.email, whatsapp: lead.whatsapp, name: lead.name,
      fbp: cookies?.fbp ?? "", fbc: cookies?.fbc ?? "", value, currency: lead.currency,
      eventTimeIso: paidAt, sourceUrl: `${base.replace(/\/+$/, "")}/${page.slug}`,
    });
    await sendMetaEvent(pixelId, event);
    // Sent. If this write fails the row stays 'claimed' (still blocks a second send).
    try { await markMetaPurchaseSent(lead.id, { value, currency: lead.currency }); } catch { console.warn("[landing-jobs] meta purchase sent mark failed"); }
  } catch (err) {
    await release();
    throw err;
  }
}

export type SendAgainResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "not-allowed" | "needs-confirm" | "send-failed"; sentAt?: string };

/**
 * Admin "send again": sends the TEXT of one status email to one person and logs it. It never claims the
 * automatic sent-once log, enqueues jobs, changes the status, or touches email_status or enrollment,
 * so a stale Paid can never enrol anyone. If the person already got this email, the caller must confirm.
 */
export async function sendStatusEmailAgain(p: { registrationId: string; kind: ManualEmailKind; confirmedAgain: boolean }): Promise<SendAgainResult> {
  const access = await resolveAccess(p.registrationId);
  if (!access) return { ok: false, reason: "not-found" };
  const { registration: person, lead } = access;
  if (!manualKindsFor(person.rowType).includes(p.kind)) return { ok: false, reason: "not-allowed" };

  let sentAt = await lastSentAt(person.id, [p.kind === "received" ? "manual_received" : p.kind]);
  // The automatic Received email leaves no log row: email_status is its record.
  if (!sentAt && p.kind === "received" && person.emailStatus === RECEIVED_SENT) sentAt = person.createdAt;
  if (sentAt && !p.confirmedAgain) return { ok: false, reason: "needs-confirm", sentAt };

  const page = await getRegistrablePageById(access.pageId);
  if (!page) return { ok: false, reason: "not-found" };
  try {
    const email = await buildStatusEmail({ kind: p.kind, person, lead, page, asOf: "now", access });
    const delivered = await deliver(lead, person.email, person.name, email);
    if (!delivered) return { ok: false, reason: "send-failed" };
  } catch {
    return { ok: false, reason: "send-failed" };
  }
  try {
    await logManualEmail(person.id, `manual_${p.kind}`, person.email);
  } catch {
    console.warn("[landing-jobs] manual email log failed"); // the email went out; do not report a failure
  }
  return { ok: true };
}

/** Resubmitted voucher: one best-effort alert to the team. Never throws (not an outbox job). */
export async function notifyVoucherResubmitted(registrationId: string): Promise<void> {
  try {
    const to = process.env.LANDING_ADMIN_EMAIL;
    if (!to) return;
    const loaded = await load(registrationId);
    if (!loaded) return;
    const { lead } = loaded.bundle;
    const email = buildVoucherResubmittedEmail({
      name: lead.name,
      email: lead.email,
      refId: lead.refId ?? "",
      eventLabel: loaded.page.registration.eventLabel || loaded.page.title,
      voucherUrl: lead.voucherUrl ?? "",
      sheetUrl: sheetUrl(loaded.page),
    });
    await sendTransactionalEmail({ to, toName: "PZ Academy", subject: email.subject, htmlContent: email.html });
  } catch {
    console.warn("[landing-jobs] voucher re-upload alert failed");
  }
}

export const JOB_HANDLERS: Record<JobType, (registrationId: string) => Promise<void>> = {
  sheet_append: sheetAppend,
  sheet_status: sheetStatus,
  email_received: emailReceived,
  email_members: emailMembers,
  email_admin: emailAdmin,
  enrollment_sync: enrollmentSync,
  email_status: emailStatus,
  sheet_details: sheetDetails,
  meta_purchase: metaPurchase,
};
