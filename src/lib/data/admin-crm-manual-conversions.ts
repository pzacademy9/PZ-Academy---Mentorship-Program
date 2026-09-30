import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { toManualConversionProgram, fromManualConversionProgram, type ManualConversionProgram } from "@/lib/crm/manual-conversion";

/**
 * Manual, batch-independent conversion records. Deliberately separate from
 * admin-crm-conversions.ts / src/lib/crm/conversion.ts — these rows never
 * feed resolveConversions or change any batch/campaign's computed
 * percentage; they are their own parallel fact about a contact.
 */

const ID_CHUNK = 100;

export type ManualConversionRow = {
  id: string;
  contactId: string;
  program: ManualConversionProgram;
  programCourseTitle: string | null;
  convertedAt: string;
  note: string | null;
  createdAt: string;
};

export async function listManualConversions(contactId: string): Promise<ManualConversionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("manual_conversions")
    .select("id, contact_id, course_id, program_label, converted_at, note, created_at, courses(title)")
    .eq("contact_id", contactId)
    .order("converted_at", { ascending: false });

  return (data ?? [])
    .map((row) => {
      // course deleted -> ON DELETE SET NULL leaves neither set; keep the row visible (and undoable)
      // instead of dropping it while the recipient badge still counts it.
      const program: ManualConversionProgram | null =
        row.course_id === null && row.program_label === null
          ? { kind: "label", pattern: "(deleted course)" }
          : toManualConversionProgram(row.course_id, row.program_label);
      if (!program) return null; // defensive: a row with both set is unrenderable, not a crash
      return {
        id: row.id,
        contactId: row.contact_id,
        program,
        programCourseTitle: (row.courses as { title: string } | null)?.title ?? null,
        convertedAt: row.converted_at,
        note: row.note,
        createdAt: row.created_at,
      };
    })
    .filter((r): r is ManualConversionRow => r !== null);
}

export type CreateManualConversionsResult = { ok: true; count: number } | { ok: false; reason: "db-error" };

export async function createManualConversions(
  contactIds: string[],
  program: ManualConversionProgram,
  convertedAt: string | undefined,
  note: string | undefined,
  createdBy: string,
): Promise<CreateManualConversionsResult> {
  const admin = createAdminSupabase();
  const { course_id, program_label } = fromManualConversionProgram(program);
  const rows = contactIds.map((contactId) => ({
    contact_id: contactId,
    course_id,
    program_label,
    converted_at: convertedAt ?? new Date().toISOString().slice(0, 10),
    note: note ?? null,
    created_by: createdBy,
  }));

  const { error, count } = await admin.from("manual_conversions").insert(rows, { count: "exact" });
  if (error) return { ok: false, reason: "db-error" };
  return { ok: true, count: count ?? rows.length };
}

export type DeleteManualConversionResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function deleteManualConversion(id: string): Promise<DeleteManualConversionResult> {
  const admin = createAdminSupabase();
  const { error, count } = await admin.from("manual_conversions").delete({ count: "exact" }).eq("id", id);
  if (error) return { ok: false, reason: "db-error" };
  if (!count) return { ok: false, reason: "not-found" };
  return { ok: true };
}

/** Feeds Task 17's recipient-row badge — which of these contacts have any manual conversion on file. */
export async function listContactIdsWithManualConversion(contactIds: string[]): Promise<Set<string>> {
  if (contactIds.length === 0) return new Set();
  const admin = createAdminSupabase();
  const found = new Set<string>();
  // Chunked so a large campaign doesn't blow the PostgREST URL length limit (same ID_CHUNK as admin-crm-contacts).
  for (let i = 0; i < contactIds.length; i += ID_CHUNK) {
    const { data } = await admin.from("manual_conversions").select("contact_id").in("contact_id", contactIds.slice(i, i + ID_CHUNK));
    for (const r of data ?? []) found.add(r.contact_id);
  }
  return found;
}
