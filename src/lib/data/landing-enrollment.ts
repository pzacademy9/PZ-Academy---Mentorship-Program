import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { desiredEnrollment, type DesiredEnrollment } from "@/lib/landing/registration/access-rules";
import { mapRecord, type RegistrationRecord } from "@/lib/data/landing-registrations";
import { getRegistrablePageById } from "@/lib/data/landing-public";

type RegRow = Database["public"]["Tables"]["landing_registrations"]["Row"];

/**
 * True when the batch for this page is marked finished for what the buyer bought.
 * - a whole-course row (module_id null) finishes everyone;
 * - a module buyer (moduleIds non-empty) is finished when every bought module has a row;
 * - a whole-course buyer without a whole-course row is finished only when the course has
 *   at least one module and every module of the course has a row.
 */
export async function isBatchFinished(pageId: string, courseId: string, moduleIds: string[]): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("landing_batch_state").select("module_id").eq("page_id", pageId);
  if (error) throw new Error(`landing_batch_state read failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.some((r) => r.module_id === null)) return true;
  const finished = new Set(rows.map((r) => r.module_id as string));
  if (moduleIds.length > 0) return moduleIds.every((id) => finished.has(id));

  const { data: mods, error: modErr } = await admin.from("modules").select("id").eq("course_id", courseId);
  if (modErr) throw new Error(`modules read failed: ${modErr.message}`);
  const all = (mods ?? []).map((m) => m.id);
  return all.length > 0 && all.every((id) => finished.has(id));
}

export interface ResolvedAccess {
  registration: RegistrationRecord;
  lead: RegistrationRecord;
  pageId: string;
  courseId: string | null;
  courseSlug: string | null;
  desired: DesiredEnrollment;
  hasAccount: boolean;
}

/**
 * What access this registration should have. A person's own row gives status / test flag / account;
 * the lead's row gives page, option keys and mode. Null when the registration or its page cannot be
 * loaded. A module option with no linked modules means the whole course (moduleIds []).
 */
export async function resolveAccess(registrationId: string): Promise<ResolvedAccess | null> {
  const admin = createAdminSupabase();
  const { data: row, error } = await admin.from("landing_registrations").select("*").eq("id", registrationId).maybeSingle();
  if (error) throw new Error(`landing_registrations read failed: ${error.message}`);
  if (!row) return null;
  const registration = mapRecord(row as RegRow);
  let lead = registration;
  if (registration.rowType === "member" && registration.leadRegistrationId) {
    const { data: leadRow, error: leadErr } = await admin.from("landing_registrations").select("*").eq("id", registration.leadRegistrationId).maybeSingle();
    if (leadErr) throw new Error(`landing_registrations read failed: ${leadErr.message}`);
    if (!leadRow) return null;
    lead = mapRecord(leadRow as RegRow);
  }
  const page = await getRegistrablePageById(lead.pageId);
  if (!page) return null;

  const courseId = page.courseId ?? null;
  let courseSlug: string | null = null;
  if (courseId) {
    const { data: course, error: courseErr } = await admin.from("courses").select("slug").eq("id", courseId).maybeSingle();
    if (courseErr) throw new Error(`courses read failed: ${courseErr.message}`);
    courseSlug = course?.slug ?? null;
  }

  const keys = new Set(lead.optionKeys);
  const moduleIds = Array.from(new Set(page.registration.options.filter((o) => keys.has(o.key)).flatMap((o) => o.moduleIds ?? [])));
  const batchFinished = courseId ? await isBatchFinished(page.id, courseId, moduleIds) : false;
  const desired = desiredEnrollment({
    status: registration.status,
    mode: lead.mode,
    hasCourse: courseId !== null,
    isTest: registration.isTest,
    moduleIds,
    batchFinished,
  });
  return { registration, lead, pageId: page.id, courseId, courseSlug, desired, hasAccount: registration.studentId !== null };
}

export type SyncOutcome = "skipped" | "granted" | "reverted" | "no-account" | "no-change";
interface EnrollmentRow {
  id: string;
  status: string;
  portal_open: boolean;
  access_level: string | null;
  landing_registration_id: string | null;
}
const ENROLLMENT_COLS = "id, status, portal_open, access_level, landing_registration_id";

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/** Unlock the first lesson of each newly added module (no DB trigger fires for added module rows). */
async function unlockFirstLessons(studentId: string, moduleIds: string[]): Promise<void> {
  if (moduleIds.length === 0) return;
  const admin = createAdminSupabase();
  const { data: mods, error: modErr } = await admin.from("modules").select("id, order_index").in("id", moduleIds);
  check("modules read", modErr);
  const { data: lessons, error: lessonErr } = await admin.from("lessons").select("id, module_id, order_index").in("module_id", moduleIds);
  check("lessons read", lessonErr);
  const firstIds: string[] = [];
  for (const m of [...(mods ?? [])].sort((a, b) => a.order_index - b.order_index)) {
    const first = (lessons ?? []).filter((l) => l.module_id === m.id).sort((a, b) => a.order_index - b.order_index)[0];
    if (first) firstIds.push(first.id);
  }
  if (firstIds.length === 0) return;
  const { data: progress, error: progErr } = await admin.from("lesson_progress").select("lesson_id, status").eq("student_id", studentId).in("lesson_id", firstIds);
  check("lesson_progress read", progErr);
  const have = new Map((progress ?? []).map((p) => [p.lesson_id, p.status]));
  const missing = firstIds.filter((id) => !have.has(id));
  const locked = firstIds.filter((id) => have.get(id) === "locked");
  if (missing.length > 0) {
    const { error } = await admin.from("lesson_progress").insert(missing.map((lesson_id) => ({ student_id: studentId, lesson_id, status: "unlocked" as const })));
    check("lesson_progress insert", error);
  }
  if (locked.length > 0) {
    const { error } = await admin.from("lesson_progress").update({ status: "unlocked" }).eq("student_id", studentId).in("lesson_id", locked).eq("status", "locked");
    check("lesson_progress unlock", error);
  }
}

/**
 * Brings the student's enrollment in line with the registration's status. Idempotent. Never calls
 * applyEnrollmentStatus (it sends its own email). Throws on DB errors so the job retries.
 */
export async function syncEnrollmentForRegistration(registrationId: string): Promise<SyncOutcome> {
  const access = await resolveAccess(registrationId);
  if (!access) return "skipped";
  const { registration, courseId, desired: d } = access;
  if (d.action === "skip" || !courseId) return "skipped";
  const studentId = registration.studentId;
  if (!studentId) return "no-account";
  const admin = createAdminSupabase();

  if (d.action === "revert") {
    const { data: owned, error } = await admin.from("enrollments").select(ENROLLMENT_COLS).eq("landing_registration_id", registration.id).maybeSingle();
    check("enrollments read", error);
    const e = owned as EnrollmentRow | null;
    if (!e || (e.status === d.status && !e.portal_open)) return "no-change";
    const { error: upErr } = await admin.from("enrollments").update({ status: d.status, portal_open: false }).eq("id", e.id);
    check("enrollments update", upErr);
    return "reverted";
  }

  // grant
  const { data: found, error: findErr } = await admin.from("enrollments").select(ENROLLMENT_COLS).eq("student_id", studentId).eq("course_id", courseId).maybeSingle();
  check("enrollments read", findErr);
  const existing = found as EnrollmentRow | null;

  if (!existing) {
    // insert pending+closed, then modules, then activate: the unlock trigger must see the modules.
    const { data: created, error } = await admin
      .from("enrollments")
      .insert({
        student_id: studentId,
        course_id: courseId,
        status: "pending",
        access_level: d.accessLevel,
        portal_open: false,
        landing_registration_id: registration.id,
        verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    check("enrollments insert", error);
    const id = (created as { id: string } | null)?.id;
    if (!id) throw new Error("enrollments insert returned no row");
    if (d.moduleIds.length > 0) {
      const { error: modErr } = await admin.from("enrollment_modules").insert(d.moduleIds.map((module_id) => ({ enrollment_id: id, module_id })));
      check("enrollment_modules insert", modErr);
    }
    const { error: actErr } = await admin.from("enrollments").update({ status: "active", portal_open: d.portalOpen }).eq("id", id);
    check("enrollments activate", actErr);
    return "granted";
  }

  // Existing enrollment (any origin): widen only. portal_open is meaningful only on an active enrollment.
  const wasActive = existing.status === "active";
  const wasOpen = wasActive && existing.portal_open;
  const portalOpen = wasActive ? existing.portal_open || d.portalOpen : d.portalOpen;

  const { data: covered, error: covErr } = await admin.from("enrollment_modules").select("module_id").eq("enrollment_id", existing.id);
  check("enrollment_modules read", covErr);
  const have = (covered ?? []).map((r) => r.module_id as string);
  let toAdd: string[] = [];
  let clearRows = false;
  if (have.length > 0) {
    if (d.moduleIds.length === 0) clearRows = true;
    else toAdd = d.moduleIds.filter((m) => !have.includes(m));
  }
  if (clearRows) {
    const { error } = await admin.from("enrollment_modules").delete().eq("enrollment_id", existing.id);
    check("enrollment_modules delete", error);
  }
  if (toAdd.length > 0) {
    const { error } = await admin.from("enrollment_modules").insert(toAdd.map((module_id) => ({ enrollment_id: existing.id, module_id })));
    check("enrollment_modules insert", error);
  }

  const patch: Database["public"]["Tables"]["enrollments"]["Update"] = {};
  if (!wasActive) patch.status = "active";
  if (portalOpen !== existing.portal_open) patch.portal_open = portalOpen;
  if (d.accessLevel === "live" && existing.access_level === "recorded") patch.access_level = "live";
  if (existing.landing_registration_id === null) patch.landing_registration_id = registration.id;
  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("enrollments").update(patch).eq("id", existing.id);
    check("enrollments update", error);
  }
  // Module rows added to an enrollment that was already active+open fire no trigger.
  if (toAdd.length > 0 && wasOpen) await unlockFirstLessons(studentId, toAdd);

  return clearRows || toAdd.length > 0 || Object.keys(patch).length > 0 ? "granted" : "no-change";
}
