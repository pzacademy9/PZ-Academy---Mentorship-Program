import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { getRegistrablePageById, type RegistrablePage } from "@/lib/data/landing-public";
import { resolveAccess, syncEnrollmentForRegistration, type ResolvedAccess } from "@/lib/data/landing-enrollment";
import { logPortalLink } from "@/lib/data/landing-email-log";
import { buildPortalLinkEmail, type LandingEmailContext } from "@/lib/emails/landing-registration";

export interface BatchResult { modulesFinished: number; opened: number; emailed: number; alreadyOpen: number; waitingForAccount: number; failed: number }
export interface LinkResult { sent: number; notOpenYet: number; waitingForAccount: number; failed: number }
export interface BatchOverview {
  courseTitle: string | null;
  modules: { id: string; title: string; finishedAt: string | null; paidLive: number; opened: number }[];
  recordedPaid: number;
}

const CONCURRENCY = 5;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://pharmacozyme.com";

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

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

async function courseModules(courseId: string): Promise<{ id: string; title: string }[]> {
  const { data, error } = await createAdminSupabase().from("modules").select("id, title, order_index").eq("course_id", courseId).order("order_index", { ascending: true });
  check("modules read", error);
  return (data ?? []).map((m) => ({ id: m.id, title: m.title }));
}

/** Paid, non-test rows of the page (leads, members and individuals: each person is their own row), resolved. */
async function paidAccessRows(pageId: string): Promise<ResolvedAccess[]> {
  const { data, error } = await createAdminSupabase().from("landing_registrations").select("id").eq("page_id", pageId).eq("status", "paid").eq("is_test", false);
  check("landing_registrations read", error);
  const out: ResolvedAccess[] = [];
  for (const r of data ?? []) {
    const access = await resolveAccess(r.id);
    if (!access || access.registration.isTest || access.lead.isTest) continue;
    if (access.desired.action !== "grant" || !access.courseId) continue;
    out.push(access);
  }
  return out;
}

/** What this buyer covers: the listed modules, or every module of the course when none are listed. */
const coverage = (a: ResolvedAccess, all: string[]): string[] => (a.desired.moduleIds.length === 0 ? all : a.desired.moduleIds);

const emptyBatch = (): BatchResult => ({ modulesFinished: 0, opened: 0, emailed: 0, alreadyOpen: 0, waitingForAccount: 0, failed: 0 });

/** Minimal email context: the link email shows only the name, event, portal button and module titles. */
function linkContext(page: RegistrablePage, a: ResolvedAccess, moduleTitles: string[]): LandingEmailContext & { portalUrl: string; moduleTitles: string[] } {
  const r = a.registration;
  return {
    name: r.name,
    eventLabel: page.registration.eventLabel || page.title,
    refId: a.lead.refId ?? "",
    optionLabel: r.optionLabel,
    currency: r.currency,
    amount: 0,
    groupSize: 1,
    region: null,
    startsOn: "",
    accounts: [],
    waGroups: [],
    verifyUrl: "",
    supportWhatsapp: page.registration.whatsappVerifyNumber,
    portalUrl: `${appUrl()}/portal/${a.courseSlug}`,
    moduleTitles,
  };
}

async function sendLink(page: RegistrablePage, a: ResolvedAccess, moduleTitles: string[]): Promise<void> {
  const email = buildPortalLinkEmail(linkContext(page, a, moduleTitles));
  await sendTransactionalEmail({ to: a.registration.email, toName: a.registration.name, subject: email.subject, htmlContent: email.html });
  try {
    await logPortalLink(a.registration.id, a.registration.email);
  } catch {
    // The email did go out; a missing log row only means a later press may send it once more.
    console.warn("[landing-batch] portal link log write failed");
  }
}

interface OpenRow { module_id: string; opened_at: string | null }
async function openRows(studentId: string, courseId: string): Promise<OpenRow[]> {
  const admin = createAdminSupabase();
  const { data: enr, error } = await admin.from("enrollments").select("id").eq("student_id", studentId).eq("course_id", courseId).maybeSingle();
  check("enrollments read", error);
  if (!enr) return [];
  const { data, error: e2 } = await admin.from("enrollment_open_modules").select("module_id, opened_at").eq("enrollment_id", enr.id);
  check("enrollment_open_modules read", e2);
  return (data ?? []) as OpenRow[];
}

async function lastLinkSentAt(registrationId: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase()
    .from("landing_email_log")
    .select("sent_at")
    .eq("registration_id", registrationId)
    .eq("kind", "portal_link")
    .eq("state", "sent")
    .order("sent_at", { ascending: false })
    .limit(1);
  check("landing_email_log read", error);
  return data?.[0]?.sent_at ?? null;
}

/**
 * Marks one module (or the whole course) as finished for this page, opens it for Paid Live buyers who
 * cover it, and emails each person who has not yet been sent a link for what just opened.
 * Safe to press again: a repeat with nothing new sends nobody; a failed send is retried by the next press.
 */
export async function finishBatch(p: { pageId: string; moduleId: string | null; adminId: string }): Promise<BatchResult> {
  const result = emptyBatch();
  const page = await getRegistrablePageById(p.pageId);
  if (!page?.courseId) return result;
  const courseId = page.courseId;
  const mods = await courseModules(courseId);
  const allIds = mods.map((m) => m.id);
  const pressed = p.moduleId === null ? allIds : allIds.filter((id) => id === p.moduleId);
  if (p.moduleId !== null && pressed.length === 0) return result;

  // Mark finished: insert the missing rows one by one so a duplicate (double press) never blocks the rest.
  const admin = createAdminSupabase();
  const { data: existing, error: exErr } = await admin.from("landing_batch_state").select("module_id").eq("page_id", p.pageId);
  check("landing_batch_state read", exErr);
  const have = new Set((existing ?? []).map((r) => r.module_id as string | null));
  const wanted: (string | null)[] = p.moduleId === null ? [...pressed, null] : pressed;
  for (const module_id of wanted) {
    if (have.has(module_id)) continue;
    const { error } = await admin.from("landing_batch_state").insert({ page_id: p.pageId, module_id, finished_by: p.adminId });
    if (error && (error as { code?: string }).code !== "23505") check("landing_batch_state insert", error);
  }
  result.modulesFinished = pressed.length;
  if (pressed.length === 0) return result;

  const titles = new Map(mods.map((m) => [m.id, m.title]));
  const rows = (await paidAccessRows(p.pageId)).filter((a) => a.desired.accessLevel === "live" && coverage(a, allIds).some((m) => pressed.includes(m)));

  await pool(rows, CONCURRENCY, async (a) => {
    if (!a.registration.studentId) { result.waitingForAccount++; return; }
    try {
      const before = await openRows(a.registration.studentId, courseId);
      const beforeSet = new Set(before.map((r) => r.module_id));
      await syncEnrollmentForRegistration(a.registration.id);
      const after = (await openRows(a.registration.studentId, courseId)).filter((r) => pressed.includes(r.module_id));
      const newlyOpened = after.some((r) => !beforeSet.has(r.module_id));
      if (newlyOpened) result.opened++;
      const last = await lastLinkSentAt(a.registration.id);
      const needing = last === null ? after : after.filter((r) => (r.opened_at ?? "") >= last);
      if (after.length === 0 || needing.length === 0) { if (!newlyOpened) result.alreadyOpen++; return; }
      try {
        await sendLink(page, a, needing.map((r) => titles.get(r.module_id) ?? "").filter(Boolean));
        result.emailed++;
      } catch {
        result.failed++;
      }
    } catch {
      result.failed++;
    }
  });
  return result;
}

/**
 * Emails the portal link to Paid buyers whose portal is open: audience picks Live, Recorded or both.
 * People whose portal is not open yet, or who have no account, are counted and not emailed.
 * `adminId` is accepted for the caller's audit trail; the send itself does not use it.
 */
export async function emailPortalLinks(p: { pageId: string; audience: "live" | "recorded" | "both"; adminId: string }): Promise<LinkResult> {
  const result: LinkResult = { sent: 0, notOpenYet: 0, waitingForAccount: 0, failed: 0 };
  const page = await getRegistrablePageById(p.pageId);
  if (!page?.courseId) return result;
  const mods = await courseModules(page.courseId);
  const titles = new Map(mods.map((m) => [m.id, m.title]));
  const rows = (await paidAccessRows(p.pageId)).filter((a) => p.audience === "both" || a.desired.accessLevel === p.audience);

  const toSend: ResolvedAccess[] = [];
  for (const a of rows) {
    if (!a.desired.portalOpen) result.notOpenYet++;
    else if (!a.registration.studentId || !a.courseSlug) result.waitingForAccount++;
    else toSend.push(a);
  }
  await pool(toSend, CONCURRENCY, async (a) => {
    try {
      const moduleTitles = a.desired.accessLevel === "live" ? a.desired.openModuleIds.map((id) => titles.get(id) ?? "").filter(Boolean) : [];
      await sendLink(page, a, moduleTitles);
      result.sent++;
    } catch {
      result.failed++;
    }
  });
  return result;
}

/** Per-module batch status for the admin screen. paidLive counts Paid Live buyers who cover the module. */
export async function getBatchOverview(pageId: string): Promise<BatchOverview> {
  const page = await getRegistrablePageById(pageId);
  if (!page?.courseId) return { courseTitle: null, modules: [], recordedPaid: 0 };
  const admin = createAdminSupabase();
  const { data: course, error: cErr } = await admin.from("courses").select("title").eq("id", page.courseId).maybeSingle();
  check("courses read", cErr);
  const mods = await courseModules(page.courseId);
  const allIds = mods.map((m) => m.id);
  const { data: batch, error: bErr } = await admin.from("landing_batch_state").select("module_id, finished_at").eq("page_id", pageId);
  check("landing_batch_state read", bErr);
  const finishedAt = new Map<string, string>();
  for (const r of batch ?? []) if (r.module_id) finishedAt.set(r.module_id, r.finished_at);

  const rows = await paidAccessRows(pageId);
  const live = rows.filter((a) => a.desired.accessLevel === "live");
  const recordedPaid = rows.filter((a) => a.desired.accessLevel === "recorded").length;

  // module ids open per student
  const studentIds = live.map((a) => a.registration.studentId).filter((s): s is string => s !== null);
  const openByStudent = new Map<string, Set<string>>();
  if (studentIds.length > 0) {
    const { data: enrs, error: eErr } = await admin.from("enrollments").select("id, student_id").eq("course_id", page.courseId).in("student_id", studentIds);
    check("enrollments read", eErr);
    const byEnrollment = new Map((enrs ?? []).map((e) => [e.id, e.student_id]));
    if (byEnrollment.size > 0) {
      const { data: opens, error: oErr } = await admin.from("enrollment_open_modules").select("enrollment_id, module_id").in("enrollment_id", Array.from(byEnrollment.keys()));
      check("enrollment_open_modules read", oErr);
      for (const o of opens ?? []) {
        const sid = byEnrollment.get(o.enrollment_id);
        if (!sid) continue;
        if (!openByStudent.has(sid)) openByStudent.set(sid, new Set());
        openByStudent.get(sid)!.add(o.module_id);
      }
    }
  }

  return {
    courseTitle: course?.title ?? null,
    modules: mods.map((m) => {
      const covering = live.filter((a) => coverage(a, allIds).includes(m.id));
      const opened = covering.filter((a) => a.registration.studentId && openByStudent.get(a.registration.studentId)?.has(m.id)).length;
      return { id: m.id, title: m.title, finishedAt: finishedAt.get(m.id) ?? null, paidLive: covering.length, opened };
    }),
    recordedPaid,
  };
}
