import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

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
