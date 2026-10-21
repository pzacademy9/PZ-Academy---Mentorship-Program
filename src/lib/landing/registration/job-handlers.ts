import "server-only";
import { sendTransactionalEmail } from "@/lib/brevo";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getRegistrationBundle, markEmailStatus, type RegistrationBundle, type RegistrationRecord } from "@/lib/data/landing-registrations";
import { getRegistrablePageById, type RegistrablePage } from "@/lib/data/landing-public";
import { saveSnapshots, saveStatusSnapshots } from "@/lib/data/landing-sheet-sync";
import { listPaymentAccounts } from "@/lib/data/landing-payment-accounts";
import { appendRegistrationRows, applyRegistrationStatus } from "@/lib/gas/event-sheet-client";
import { STATUS_LABELS, toSheetRow, type SheetRegistration } from "./sheet-row";
import { selectWaGroups } from "./wa-groups";
import { buildVerifyMessage, whatsappVerifyUrl } from "./labels";
import {
  buildAdminAlertEmail, buildFreeJoiningEmail, buildMemberReceivedEmail, buildPaidEmail, buildReceivedEmail, buildReservedEmail,
  buildUnderpaidEmail, buildVoucherResubmittedEmail,
  formatStartsOn, withTestPrefix, type BuiltEmail, type LandingEmailContext,
} from "@/lib/emails/landing-registration";
import { resolveAccess, syncEnrollmentForRegistration } from "@/lib/data/landing-enrollment";
import { claimEmail, markEmailSent, releaseEmail, type EmailLogKind } from "@/lib/data/landing-email-log";
import { emailGetsPortalLink } from "./access-rules";
import type { JobType } from "@/lib/data/landing-jobs";

/** email_status value once the "received" email reached this person (makes retries idempotent). */
export const RECEIVED_SENT = "received_sent";

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

async function deliver(lead: RegistrationRecord, intendedTo: string, toName: string, email: BuiltEmail): Promise<void> {
  const to = lead.isTest ? await testRecipient(lead) : intendedTo;
  if (!to) return;
  const final = lead.isTest ? withTestPrefix(email) : email;
  await sendTransactionalEmail({ to, toName, subject: final.subject, htmlContent: final.html });
}

const sheetUrl = (page: RegistrablePage) => (page.sheetId ? `https://docs.google.com/spreadsheets/d/${page.sheetId}/edit` : "");

async function emailContext(lead: RegistrationRecord, page: RegistrablePage): Promise<LandingEmailContext> {
  const cfg = page.registration;
  const region = cfg.regions.find((r) => r.key === lead.region) ?? null;
  const isFree = lead.status === "free";
  const accounts = !isFree && region ? await listPaymentAccounts(region.accountKeys) : [];
  const refId = lead.refId ?? "";
  const verifyMessage = buildVerifyMessage(cfg, { name: lead.name, email: lead.email, refId, optionLabel: lead.optionLabel, isFree });
  return {
    name: lead.name,
    eventLabel: cfg.eventLabel || page.title,
    refId,
    optionLabel: lead.optionLabel,
    currency: lead.currency,
    amount: lead.expectedAmount ?? 0,
    groupSize: lead.groupSize,
    region: region ? { label: region.label, classTime: region.classTime, timezoneLabel: region.timezoneLabel } : null,
    startsOn: formatStartsOn(page.content.settings.countdownTo),
    accounts,
    waGroups: selectWaGroups(cfg, lead.optionKeys, lead.mode),
    verifyUrl: verifyMessage ? whatsappVerifyUrl(cfg.whatsappVerifyNumber, verifyMessage) : "",
    supportWhatsapp: cfg.whatsappVerifyNumber,
  };
}

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
  const rows = [bundle.lead, ...bundle.members].map((r) => ({
    refId: bundle.lead.refId ?? "",
    email: r.email,
    // The script only knows the sheet words ("Paid"), not the database words ("paid").
    status: STATUS_LABELS[r.status],
    amountReceived: r.amountReceived,
  }));
  const res = await applyRegistrationStatus(page.sheetId, rows);
  if (!res.ok) throw new Error("Sheet status update failed");
  // Only status and amount: a status push must not overwrite the stored name/email/WhatsApp snapshot.
  // A row the script could not find was not rewritten, so its remembered value must stay as it was (sheet == snapshot).
  const missing = new Set((res.missing ?? []).map((k) => k.trim()));
  const keyOf = (r: { email: string }) => `${(bundle.lead.refId ?? "").trim().toUpperCase()}|${r.email.trim().toLowerCase()}`;
  await saveStatusSnapshots(
    [bundle.lead, ...bundle.members]
      .filter((r) => !missing.has(keyOf(r)))
      .map((r) => ({ id: r.id, status: r.status, amountReceived: r.amountReceived })),
  );
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

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";

const STATUS_EMAIL_KIND: Partial<Record<RegistrationRecord["status"], EmailLogKind>> = { paid: "paid", underpaid: "underpaid", reserved: "reserved" };

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
      const { desired, courseId, courseSlug, hasAccount } = access;
      const isPaid = kind === "paid";
      const portalUrl = hasAccount && courseSlug && emailGetsPortalLink(desired) ? `${appUrl()}/portal/${courseSlug}` : undefined;
      const ctx: LandingEmailContext = {
        ...base,
        name: person.name,
        email: person.email,
        amountReceived: person.amountReceived,
        coveredByGroup: person.rowType === "member",
        portalUrl,
        needsAccount: isPaid && courseId !== null && !hasAccount,
        signupUrl: `${appUrl()}/register`,
        portalOpensLater: isPaid && lead.mode === "live" && !desired.portalOpen,
        noCourse: courseId === null,
      };
      const email = kind === "paid" ? buildPaidEmail(ctx) : kind === "underpaid" ? buildUnderpaidEmail(ctx) : buildReservedEmail(ctx);
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
};
