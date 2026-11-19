import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { PortalError } from "@/lib/data/portal-errors";

export type PortalSummary = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  familyId: string | null;
  familyName: string | null;
  batchLabel: string | null;
};
export type PortalOverview = {
  portal: PortalSummary | null;
  siblings: PortalSummary[];
  families: { id: string; name: string }[];
  sources: PortalSummary[];
};
export type MovePreview = { toMove: number; alreadyThere: number; unmatchedModules: number };

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/** Known messages raised by the SQL functions become calm errors; anything else is a plain failure. */
function mapRpcError(error: { message?: string }): never {
  const m = error.message ?? "";
  if (m.includes("already uses that portal")) throw new PortalError("This batch already uses that portal.", 409);
  if (m.includes("has no portal yet")) throw new PortalError("This batch has no portal yet. Pick one first.", 409);
  if (m.includes("has no modules yet")) throw new PortalError("That portal has no modules yet.", 409);
  if (m.includes("Registration page not found")) throw new PortalError("That registration page was not found.", 404);
  if (m.includes("new portal was not found")) throw new PortalError("That portal was not found.", 404);
  if (m.includes("portal to copy was not found")) throw new PortalError("The portal to copy was not found.", 404);
  if (m.includes("group was not found")) throw new PortalError("That group was not found.", 404);
  throw new Error(`portal rpc failed: ${m}`);
}

/** Returns the id of the named family, creating it when it does not exist yet. */
async function ensureFamily(name: string): Promise<string> {
  const admin = createAdminSupabase();
  const trimmed = name.trim();
  const { data: existing, error: e1 } = await admin.from("course_families").select("id").eq("name", trimmed).maybeSingle();
  check("course_families read", e1);
  if (existing) return existing.id;
  const { data, error } = await admin.from("course_families").insert({ name: trimmed } as never).select("id").single();
  check("course_families insert", error);
  return (data as { id: string }).id;
}

async function requirePage(pageId: string): Promise<void> {
  const { data, error } = await createAdminSupabase().from("landing_pages").select("id").eq("id", pageId).maybeSingle();
  check("landing_pages read", error);
  if (!data) throw new PortalError("That registration page was not found.", 404);
}

async function requireCourse(courseId: string): Promise<void> {
  const { data, error } = await createAdminSupabase().from("courses").select("id").eq("id", courseId).maybeSingle();
  check("courses read", error);
  if (!data) throw new PortalError("That portal was not found.", 404);
}

type CourseRow = { id: string; title: string; slug: string; is_published: boolean | null; family_id: string | null; batch_label: string | null };

export async function getPortalOverview(pageId: string): Promise<PortalOverview | null> {
  const admin = createAdminSupabase();
  const { data: page, error: pe } = await admin.from("landing_pages").select("id, course_id").eq("id", pageId).maybeSingle();
  check("landing_pages read", pe);
  if (!page) return null;

  const { data: courses, error: ce } = await admin
    .from("courses")
    .select("id, title, slug, is_published, family_id, batch_label")
    .order("title", { ascending: true });
  check("courses read", ce);
  const { data: fams, error: fe } = await admin.from("course_families").select("id, name").order("name", { ascending: true });
  check("course_families read", fe);

  const families = (fams ?? []).map((f) => ({ id: f.id, name: f.name }));
  const nameOf = new Map(families.map((f) => [f.id, f.name]));
  const summarise = (c: CourseRow): PortalSummary => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    published: !!c.is_published,
    familyId: c.family_id,
    familyName: c.family_id ? nameOf.get(c.family_id) ?? null : null,
    batchLabel: c.batch_label,
  });
  const all = ((courses ?? []) as CourseRow[]).map(summarise);
  const portal = all.find((c) => c.id === page.course_id) ?? null;
  const siblings = portal ? all.filter((c) => c.id !== portal.id && c.familyId === portal.familyId) : [];
  return { portal, siblings, families, sources: all };
}

export async function duplicatePortal(p: {
  pageId: string;
  sourceCourseId: string;
  title: string;
  familyId: string | null;
  newFamilyName: string | null;
  batchLabel: string | null;
}): Promise<{ courseId: string }> {
  const title = p.title.trim();
  if (!title) throw new PortalError("A name is needed for the new portal.", 400);
  await requirePage(p.pageId);
  const familyId = p.newFamilyName?.trim() ? await ensureFamily(p.newFamilyName) : p.familyId;
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc(
    "duplicate_course",
    { p_source: p.sourceCourseId, p_title: title, p_family: familyId, p_batch_label: p.batchLabel?.trim() || null } as never,
  );
  if (error) mapRpcError(error);
  const courseId = String(data);
  const { error: ue } = await admin.from("landing_pages").update({ course_id: courseId } as never).eq("id", p.pageId);
  check("landing_pages update", ue);
  return { courseId };
}

export async function attachPortal(pageId: string, courseId: string): Promise<void> {
  await requirePage(pageId);
  await requireCourse(courseId);
  const { error } = await createAdminSupabase().from("landing_pages").update({ course_id: courseId } as never).eq("id", pageId);
  check("landing_pages update", error);
}

export async function setPortalGroup(p: {
  courseId: string;
  familyId: string | null;
  newFamilyName: string | null;
  batchLabel: string | null;
}): Promise<void> {
  await requireCourse(p.courseId);
  const familyId = p.newFamilyName?.trim() ? await ensureFamily(p.newFamilyName) : p.familyId;
  const { error } = await createAdminSupabase()
    .from("courses")
    .update({ family_id: familyId, batch_label: p.batchLabel?.trim() || null } as never)
    .eq("id", p.courseId);
  check("courses update", error);
}

async function runMove(pageId: string, toCourseId: string, dryRun: boolean): Promise<Record<string, number>> {
  const { data, error } = await createAdminSupabase().rpc(
    "move_batch_students",
    { p_page: pageId, p_to_course: toCourseId, p_dry_run: dryRun } as never,
  );
  if (error) mapRpcError(error);
  return (data ?? {}) as Record<string, number>;
}

export async function previewMove(pageId: string, toCourseId: string): Promise<MovePreview> {
  const r = await runMove(pageId, toCourseId, true);
  return { toMove: Number(r.to_move ?? 0), alreadyThere: Number(r.already_there ?? 0), unmatchedModules: Number(r.unmatched_modules ?? 0) };
}

export async function moveStudents(pageId: string, toCourseId: string): Promise<{ moved: number }> {
  const r = await runMove(pageId, toCourseId, false);
  return { moved: Number(r.moved ?? 0) };
}
