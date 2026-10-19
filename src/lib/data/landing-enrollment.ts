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
  const picked = page.registration.options.filter((o) => keys.has(o.key));
  // Any picked option without linked modules means the whole course.
  const moduleIds = picked.some((o) => (o.moduleIds ?? []).length === 0) ? [] : Array.from(new Set(picked.flatMap((o) => o.moduleIds ?? [])));
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

/**
 * Idempotently unlock the first lesson (lowest module order, then lesson order) of each given module.
 * Inserts missing rows (ignoring duplicates) and moves only 'locked' rows to 'unlocked': an
 * unlocked/completed row is never touched. No DB trigger fires for module rows added later.
 */
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
  const { error: insErr } = await admin
    .from("lesson_progress")
    .upsert(firstIds.map((lesson_id) => ({ student_id: studentId, lesson_id, status: "unlocked" as const })), { onConflict: "student_id,lesson_id", ignoreDuplicates: true });
  check("lesson_progress insert", insErr);
  const { error: upErr } = await admin.from("lesson_progress").update({ status: "unlocked" }).eq("student_id", studentId).in("lesson_id", firstIds).eq("status", "locked");
  check("lesson_progress unlock", upErr);
}

/** Id of another non-test paid registration by this student on a page of this course, or null. */
async function findOtherPaidRegistration(studentId: string, courseId: string, exceptId: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_registrations")
    .select("id, page_id")
    .eq("student_id", studentId)
    .eq("status", "paid")
    .eq("is_test", false)
    .neq("id", exceptId);
  check("landing_registrations read", error);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const { data: pages, error: pageErr } = await admin.from("landing_pages").select("id").eq("course_id", courseId).in("id", rows.map((r) => r.page_id));
  check("landing_pages read", pageErr);
  const ok = new Set((pages ?? []).map((p) => p.id));
  return rows.find((r) => ok.has(r.page_id))?.id ?? null;
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
    if (!e) return "no-change";
    // Another paid registration of the same student for this course keeps the access: hand over ownership.
    const other = await findOtherPaidRegistration(studentId, courseId, registration.id);
    if (other) {
      const { error: xferErr } = await admin.from("enrollments").update({ landing_registration_id: other }).eq("id", e.id);
      check("enrollments transfer", xferErr);
      return "no-change";
    }
    if (e.status === d.status && !e.portal_open) return "no-change";
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

  // Existing enrollment (any origin). portal_open is meaningful only on an active enrollment.
  const wasActive = existing.status === "active";
  const portalOpen = wasActive ? existing.portal_open || d.portalOpen : d.portalOpen;

  const { data: covered, error: covErr } = await admin.from("enrollment_modules").select("module_id").eq("enrollment_id", existing.id);
  check("enrollment_modules read", covErr);
  const have = (covered ?? []).map((r) => r.module_id as string);
  let toDelete: string[] = [];
  let toAdd: string[] = [];
  let widenedToWhole = false;
  if (!wasActive) {
    // Not active = grants no access today, so its coverage is REPLACED by what was bought
    // (no rows would otherwise read as "whole course").
    toDelete = have.filter((m) => !d.moduleIds.includes(m));
    toAdd = d.moduleIds.filter((m) => !have.includes(m));
  } else if (have.length > 0) {
    // Active: widen only.
    if (d.moduleIds.length === 0) { toDelete = have; widenedToWhole = true; }
    else toAdd = d.moduleIds.filter((m) => !have.includes(m));
  }

  // Modules whose first lesson must be unlocked by hand (active + open, no DB trigger for module rows).
  let unlockModules: string[] = [];
  if (portalOpen) {
    if (widenedToWhole) {
      const { data: all, error } = await admin.from("modules").select("id").eq("course_id", courseId);
      check("modules read", error);
      unlockModules = (all ?? []).map((m) => m.id).filter((m) => !have.includes(m));
    } else if (d.moduleIds.length > 0 && (!wasActive || have.length > 0)) {
      unlockModules = Array.from(new Set(wasActive ? [...have, ...toAdd] : d.moduleIds));
    }
  }
  // Widening an open enrollment to the whole course: unlock BEFORE the rows go, so a failure retries cleanly.
  const unlockFirst = widenedToWhole && wasActive && existing.portal_open;
  if (unlockFirst) await unlockFirstLessons(studentId, unlockModules);

  if (toDelete.length > 0) {
    const { error } = await admin.from("enrollment_modules").delete().eq("enrollment_id", existing.id).in("module_id", toDelete);
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
  if (!wasActive && existing.access_level === null) patch.access_level = d.accessLevel;
  // Adopt the enrollment only when this registration is what activates it, so a later reversal
  // can never close an enrollment that was already active.
  if (!wasActive && existing.landing_registration_id === null) patch.landing_registration_id = registration.id;
  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from("enrollments").update(patch).eq("id", existing.id);
    check("enrollments update", error);
  }
  if (!unlockFirst) await unlockFirstLessons(studentId, unlockModules);

  return toDelete.length > 0 || toAdd.length > 0 || Object.keys(patch).length > 0 ? "granted" : "no-change";
}