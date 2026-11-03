import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type DeleteRegistrationResult =
  | { ok: true; removedMembers: number }
  | { ok: false; reason: "not-found" | "member-row" | "db-error" };

type Admin = ReturnType<typeof createAdminSupabase>;

/** Id of another non-test paid registration by this student on a page of this course that is not being deleted, or null. */
async function otherPaidRegistration(db: Admin, studentId: string, courseId: string, deleting: string[]): Promise<string | null> {
  const { data, error } = await db
    .from("landing_registrations")
    .select("id, page_id")
    .eq("student_id", studentId)
    .eq("status", "paid")
    .eq("is_test", false);
  if (error) throw new Error(error.code);
  const rows = (data ?? []).filter((r) => !deleting.includes(r.id as string));
  if (rows.length === 0) return null;
  const { data: pages, error: pErr } = await db.from("landing_pages").select("id").eq("course_id", courseId).in("id", rows.map((r) => r.page_id as string));
  if (pErr) throw new Error(pErr.code);
  const ok = new Set((pages ?? []).map((p) => p.id as string));
  return rows.find((r) => ok.has(r.page_id as string))?.id as string | undefined ?? null;
}

/**
 * Delete one registration for good (admin only; the route gates that). A group lead takes its members with it.
 * The registration's own records (status history, emails sent, sheet-sync notes, jobs, messages, mirror memory) go
 * with it by the database's cascade rules.
 *
 * Course access: an enrollment is one student + one course, and another paid registration of that student for the
 * same course may depend on it. Then the enrollment is handed to that registration and kept. Otherwise it is deleted
 * (after the old sheet-lead link to it is cleared, which would block the delete). The access goes first and the
 * registration last, so a failure in between can simply be retried.
 *
 * Sign-in accounts, PZ IDs, the voucher file in Drive and anything already sent stay.
 */
export async function deleteRegistration(p: { registrationId: string }): Promise<DeleteRegistrationResult> {
  const db = createAdminSupabase();
  try {
    const { data: row, error } = await db.from("landing_registrations").select("id, row_type").eq("id", p.registrationId).maybeSingle();
    if (error) { console.error("[landing-registration-delete] read failed:", error.code); return { ok: false, reason: "db-error" }; }
    if (!row) return { ok: false, reason: "not-found" };
    if (row.row_type === "member") return { ok: false, reason: "member-row" };

    const { data: memberRows, error: mErr } = await db.from("landing_registrations").select("id").eq("lead_registration_id", row.id);
    if (mErr) { console.error("[landing-registration-delete] members read failed:", mErr.code); return { ok: false, reason: "db-error" }; }
    const memberIds = (memberRows ?? []).map((m) => m.id as string);
    const ids = [row.id as string, ...memberIds];

    const { data: owned, error: oErr } = await db.from("enrollments").select("id, student_id, course_id").in("landing_registration_id", ids);
    if (oErr) { console.error("[landing-registration-delete] enrollments read failed:", oErr.code); return { ok: false, reason: "db-error" }; }

    const toDelete: string[] = [];
    for (const e of owned ?? []) {
      const keeper = e.student_id && e.course_id ? await otherPaidRegistration(db, e.student_id as string, e.course_id as string, ids) : null;
      if (keeper) {
        const { error: xErr } = await db.from("enrollments").update({ landing_registration_id: keeper }).eq("id", e.id);
        if (xErr) { console.error("[landing-registration-delete] hand-over failed:", xErr.code); return { ok: false, reason: "db-error" }; }
      } else {
        toDelete.push(e.id as string);
      }
    }
    if (toDelete.length > 0) {
      const { error: lErr } = await db.from("sheet_leads").update({ resolved_enrollment_id: null }).in("resolved_enrollment_id", toDelete);
      if (lErr) { console.error("[landing-registration-delete] sheet lead unlink failed:", lErr.code); return { ok: false, reason: "db-error" }; }
      const { error: eErr } = await db.from("enrollments").delete().in("id", toDelete);
      if (eErr) { console.error("[landing-registration-delete] enrollment removal failed:", eErr.code); return { ok: false, reason: "db-error" }; }
    }

    const { error: dErr } = await db.from("landing_registrations").delete().eq("id", row.id);
    if (dErr) { console.error("[landing-registration-delete] delete failed:", dErr.code); return { ok: false, reason: "db-error" }; }
    return { ok: true, removedMembers: memberIds.length };
  } catch (e) {
    console.error("[landing-registration-delete] crashed:", (e as Error)?.message);
    return { ok: false, reason: "db-error" };
  }
}
