import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import {
  slugify,
  usesFlatSessions,
  typeSwitchEligibility,
  publishEligibility,
  reorderIndexes,
  type CourseStatus,
  type CourseType,
  type LessonContentType,
} from "@/lib/validations/admin-lms";
import type { courseConfigSchema } from "@/lib/validations/admin-lms";
import type { z } from "zod";
import { sanitizeLessonHtml } from "@/lib/sanitize-html";
import {
  diffCourseImageFileIds,
  diffLessonFileIds,
  extractDriveFileId,
  collectLessonFileIds,
} from "@/lib/validations/drive-cleanup";
import { trashDriveFiles } from "@/lib/data/drive-cleanup";

/**
 * Admin data layer for the Program Builder (Phase 3). Mirrors the
 * conventions in src/lib/data/admin-enrollments.ts: the service-role client
 * (every caller is already gated by requireAdmin()/requireAdminPage() at its
 * own route boundary), typed row mappers, explicit column selects.
 *
 * This file grows across the build sequence in
 * docs/superpowers/plans (see the approved plan) — only the Program Library
 * read path lands here in Part A. Module/lesson/quiz CRUD, reordering, and
 * publish/delete land in later parts.
 */

export interface ProgramListRow {
  id: string;
  slug: string;
  title: string;
  type: CourseType;
  status: CourseStatus;
  pricePkr: number;
  isPublished: boolean;
  sessionCount: number;
  enrollmentCount: number;
}

export interface ProgramListStats {
  total: number;
  published: number;
  draft: number;
  avgPricePkr: number;
}

interface RawCourseRow {
  id: string;
  slug: string;
  title: string;
  type: CourseType;
  status: CourseStatus;
  price_pkr: number;
  is_published: boolean;
}

/**
 * The Program Library table + stat cards (ports "Admin: Course Manager
 * List"). Session and enrollment counts are computed in-memory from small
 * full-table reads — fine at this platform's current size (a handful of
 * programs), same "good enough for now" call already made elsewhere in this
 * codebase (see findStudentIdByEmail's comment in sheet-sync.ts).
 */
export async function listPrograms(): Promise<{ rows: ProgramListRow[]; stats: ProgramListStats }> {
  const admin = createAdminSupabase();

  const [{ data: courses }, { data: modules }, { data: lessons }, { data: enrollments }] = await Promise.all([
    admin
      .from("courses")
      .select("id, slug, title, type, status, price_pkr, is_published")
      .order("title"),
    admin.from("modules").select("id, course_id"),
    admin.from("lessons").select("id, module_id"),
    admin.from("enrollments").select("id, course_id"),
  ]);

  const courseRows = (courses ?? []) as RawCourseRow[];
  const moduleToCourse = new Map((modules ?? []).map((m) => [m.id, m.course_id]));

  const sessionCountByCourse = new Map<string, number>();
  for (const lesson of lessons ?? []) {
    const courseId = moduleToCourse.get(lesson.module_id);
    if (!courseId) continue;
    sessionCountByCourse.set(courseId, (sessionCountByCourse.get(courseId) ?? 0) + 1);
  }

  const enrollmentCountByCourse = new Map<string, number>();
  for (const enrollment of enrollments ?? []) {
    enrollmentCountByCourse.set(
      enrollment.course_id,
      (enrollmentCountByCourse.get(enrollment.course_id) ?? 0) + 1,
    );
  }

  const rows: ProgramListRow[] = courseRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    type: c.type,
    status: c.status,
    pricePkr: c.price_pkr,
    isPublished: c.is_published,
    sessionCount: sessionCountByCourse.get(c.id) ?? 0,
    enrollmentCount: enrollmentCountByCourse.get(c.id) ?? 0,
  }));

  const published = rows.filter((r) => r.isPublished).length;
  const avgPricePkr =
    rows.length === 0 ? 0 : Math.round(rows.reduce((sum, r) => sum + r.pricePkr, 0) / rows.length);

  return {
    rows,
    stats: { total: rows.length, published, draft: rows.length - published, avgPricePkr },
  };
}

// ---------------------------------------------------------------------------
// Part B — Configuration (create / edit / delete a single program)
// ---------------------------------------------------------------------------

export type CourseConfigInput = z.infer<typeof courseConfigSchema>;

export interface CourseConfigDetail {
  id: string;
  slug: string;
  title: string;
  type: CourseType;
  status: CourseStatus;
  isPublished: boolean;
  tagline: string;
  description: string;
  pricePkr: number;
  level: string;
  durationText: string;
  timings: string;
  features: string[];
  outcomes: string[];
  faqs: { question: string; answer: string }[];
  registerUrl: string;
  gasWebappUrl: string;
  thumbnailUrl: string;
  bannerUrl: string;
  mentorName: string;
  mentorTitle: string;
  mentorBio: string;
  mentorAvatarUrl: string;
  moduleCount: number;
  sessionCount: number;
  enrollmentCounts: { total: number; active: number; pending: number; rejected: number; expired: number };
}

/**
 * Ensures a course has the single hidden module that flat types (workshop /
 * webinar / mentorship) store their sessions in — see usesFlatSessions() and
 * the "Modules for Courses only" decision in the approved plan. Idempotent:
 * returns the existing module if one already exists, never creates a second.
 */
export async function ensureDefaultModule(courseId: string): Promise<string> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from("modules")
    .select("id")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await admin
    .from("modules")
    .insert({ course_id: courseId, title: "Sessions", order_index: 0 })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not create the default module for this program.");
  return data.id;
}

/** Full detail for the Configuration page: course fields + counts, nothing else. */
export async function getCourseConfig(id: string): Promise<CourseConfigDetail | null> {
  const admin = createAdminSupabase();

  const [{ data: course }, { data: modules }, { data: enrollments }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).maybeSingle(),
    admin.from("modules").select("id").eq("course_id", id),
    admin.from("enrollments").select("status").eq("course_id", id),
  ]);
  if (!course) return null;

  const moduleIds = (modules ?? []).map((m) => m.id);
  let sessionCount = 0;
  if (moduleIds.length > 0) {
    const { count } = await admin
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .in("module_id", moduleIds);
    sessionCount = count ?? 0;
  }

  const enrollmentCounts = { total: 0, active: 0, pending: 0, rejected: 0, expired: 0 };
  for (const row of enrollments ?? []) {
    enrollmentCounts.total += 1;
    if (row.status === "active") enrollmentCounts.active += 1;
    else if (row.status === "pending" || row.status === "reserved") enrollmentCounts.pending += 1;
    else if (row.status === "rejected") enrollmentCounts.rejected += 1;
    else if (row.status === "expired") enrollmentCounts.expired += 1;
  }

  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    type: course.type,
    status: course.status,
    isPublished: course.is_published,
    tagline: course.tagline ?? "",
    description: course.description ?? "",
    pricePkr: course.price_pkr,
    level: course.level ?? "",
    durationText: course.duration_text ?? (course.duration_weeks != null ? `${course.duration_weeks} Weeks` : ""),
    timings: course.timings ?? "",
    features: course.features ?? [],
    outcomes: course.outcomes ?? [],
    faqs: (course.faqs as { question: string; answer: string }[] | null) ?? [],
    registerUrl: course.register_url ?? "",
    gasWebappUrl: course.gas_webapp_url ?? "",
    thumbnailUrl: course.thumbnail_url ?? "",
    bannerUrl: course.banner_url ?? "",
    mentorName: course.mentor_name ?? "",
    mentorTitle: course.mentor_title ?? "",
    mentorBio: course.mentor_bio ?? "",
    mentorAvatarUrl: course.mentor_avatar_url ?? "",
    moduleCount: moduleIds.length,
    sessionCount,
    enrollmentCounts,
  };
}

export type CreateCourseResult = { ok: true; id: string; slug: string } | { ok: false; reason: "db-error" };

/**
 * Creates a draft program. Flat types (workshop/webinar/mentorship) get their
 * hidden "Sessions" module immediately, so the Builder (Part C) never has to
 * special-case a course with zero modules.
 */
export async function createCourse(input: { title: string; type: CourseType }): Promise<CreateCourseResult> {
  const admin = createAdminSupabase();

  const baseSlug = slugify(input.title) || "program";
  let slug = baseSlug;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const { data: existing } = await admin.from("courses").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const { data, error } = await admin
    .from("courses")
    .insert({
      title: input.title,
      slug,
      type: input.type,
      status: "draft",
      is_published: false,
      price_pkr: 0,
    })
    .select("id, slug")
    .single();
  if (error || !data) return { ok: false, reason: "db-error" };

  if (usesFlatSessions(input.type)) {
    await ensureDefaultModule(data.id);
  }

  return { ok: true, id: data.id, slug: data.slug };
}

export type UpdateCourseConfigResult =
  | { ok: true; warning: string | null }
  | { ok: false; reason: "not-found" | "type-switch-blocked" | "db-error"; message?: string };

/**
 * Applies the Configuration form. Column whitelist mirrors connect-sheet's
 * route: "courses: super_admin write" (0002) only covers super_admin, but
 * requireAdmin() also allows plain admin, so this goes through the
 * service-role client rather than the session-scoped one.
 *
 * features/outcomes/faqs are only written when the caller actually supplied
 * them — see the comment on courseConfigSchema. This form never sends them,
 * so PPC/MDC's real marketing copy survives every Configuration save.
 */
export async function updateCourseConfig(
  id: string,
  input: CourseConfigInput,
): Promise<UpdateCourseConfigResult> {
  const admin = createAdminSupabase();

  const { count: moduleCount } = await admin
    .from("modules")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id);
  const switchCheck = typeSwitchEligibility(input.type, moduleCount ?? 0);
  if (!switchCheck.ok) {
    return { ok: false, reason: "type-switch-blocked", message: switchCheck.reason };
  }

  const { data: existing } = await admin
    .from("courses")
    .select("thumbnail_url, banner_url, mentor_avatar_url")
    .eq("id", id)
    .maybeSingle();

  const patch: Database["public"]["Tables"]["courses"]["Update"] = {
    title: input.title,
    type: input.type,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    status: input.status,
    price_pkr: input.pricePkr,
    level: input.level ?? null,
    duration_text: input.durationText ?? null,
    timings: input.timings ?? null,
    register_url: input.registerUrl ?? null,
    thumbnail_url: input.thumbnailUrl ?? null,
    banner_url: input.bannerUrl ?? null,
    mentor_name: input.mentorName ?? null,
    mentor_title: input.mentorTitle ?? null,
    mentor_bio: input.mentorBio ?? null,
    mentor_avatar_url: input.mentorAvatarUrl ?? null,
    gas_webapp_url: input.gasWebappUrl ?? null,
  };
  if (input.features !== undefined) patch.features = input.features;
  if (input.outcomes !== undefined) patch.outcomes = input.outcomes;
  if (input.faqs !== undefined) patch.faqs = input.faqs;

  // Switching into a flat type needs its hidden module to exist the moment
  // the Builder is opened next.
  if (usesFlatSessions(input.type)) {
    await ensureDefaultModule(id);
  }

  const { data, error } = await admin.from("courses").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warning = existing
    ? await trashDriveFiles(
        diffCourseImageFileIds(
          {
            thumbnailUrl: existing.thumbnail_url,
            bannerUrl: existing.banner_url,
            mentorAvatarUrl: existing.mentor_avatar_url,
          },
          {
            thumbnailUrl: input.thumbnailUrl ?? null,
            bannerUrl: input.bannerUrl ?? null,
            mentorAvatarUrl: input.mentorAvatarUrl ?? null,
          },
        ),
      )
    : null;

  return { ok: true, warning };
}

export type DeleteCourseResult =
  | { ok: true; warning: string | null }
  | { ok: false; reason: "not-found" | "has-enrollments" | "db-error"; enrollmentCount?: number };

/**
 * enrollments.course_id is ON DELETE CASCADE (0001_enums_and_tables.sql:91) —
 * deleting a course with any enrollment row, in any status, would silently
 * erase real payment and enrollment history. Blocked outright; unpublishing
 * is the offered alternative (see the plan's delete-guards table).
 */
export async function deleteCourse(id: string): Promise<DeleteCourseResult> {
  const admin = createAdminSupabase();

  const { count } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, reason: "has-enrollments", enrollmentCount: count ?? 0 };
  }

  const { data: course } = await admin
    .from("courses")
    .select("thumbnail_url, banner_url, mentor_avatar_url")
    .eq("id", id)
    .maybeSingle();

  const { data: modules } = await admin.from("modules").select("id").eq("course_id", id);
  const moduleIds = (modules ?? []).map((m) => m.id);
  let lessons: Array<{ pdf_file_id: string | null; documents: unknown }> = [];
  if (moduleIds.length > 0) {
    const { data } = await admin.from("lessons").select("pdf_file_id, documents").in("module_id", moduleIds);
    lessons = data ?? [];
  }

  const { data, error } = await admin.from("courses").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const fileIdsToTrash = [
    ...(course
      ? [course.thumbnail_url, course.banner_url, course.mentor_avatar_url]
          .map((url) => extractDriveFileId(url))
          .filter((id): id is string => id !== null)
      : []),
    ...collectLessonFileIds(
      lessons.map((l) => ({
        pdfFileId: l.pdf_file_id,
        documents: (l.documents as unknown as Array<{ fileId: string }>) ?? [],
      })),
    ),
  ];
  const warning = await trashDriveFiles(fileIdsToTrash);

  return { ok: true, warning };
}

export type SetPublishedResult =
  | { ok: true; isPublished: boolean; warning: string | null }
  | { ok: false; reason: "not-found" | "zero-sessions" | "db-error"; message?: string };

/**
 * Unpublishing is always allowed. Publishing is hard-blocked at zero
 * sessions (see publishEligibility) — this is the one enforcement point for
 * that rule, called from the Builder's Publish toggle (Part C) and available
 * to any other future entry point.
 */
export async function setCoursePublished(id: string, publish: boolean): Promise<SetPublishedResult> {
  const admin = createAdminSupabase();
  const detail = await getCourseConfig(id);
  if (!detail) return { ok: false, reason: "not-found" };

  let warning: string | null = null;
  if (publish) {
    const check = publishEligibility(detail.type, detail.sessionCount);
    if (!check.ok) return { ok: false, reason: "zero-sessions", message: check.reason };
    warning = check.warning;
  }

  const { error } = await admin.from("courses").update({ is_published: publish }).eq("id", id);
  if (error) return { ok: false, reason: "db-error" };
  return { ok: true, isPublished: publish, warning };
}

// ---------------------------------------------------------------------------
// Part C — Builder shell + Content (module/lesson CRUD, reordering)
// ---------------------------------------------------------------------------

export interface BuilderLesson {
  id: string;
  title: string;
  contentType: LessonContentType;
  orderIndex: number;
}

export interface BuilderModule {
  id: string;
  title: string;
  orderIndex: number;
  lessons: BuilderLesson[];
}

export interface BuilderState {
  course: { id: string; slug: string; title: string; type: CourseType; isPublished: boolean };
  /** True for workshop/webinar/mentorship — the UI renders modules[0].lessons flat, no module chrome. */
  flat: boolean;
  modules: BuilderModule[];
}

/** Everything the Builder page needs in one round trip. */
export async function getBuilderState(courseId: string): Promise<BuilderState | null> {
  const admin = createAdminSupabase();

  const { data: course } = await admin
    .from("courses")
    .select("id, slug, title, type, is_published")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: modules } = await admin
    .from("modules")
    .select("id, title, order_index")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await admin
        .from("lessons")
        .select("id, title, content_type, order_index, module_id")
        .in("module_id", moduleIds)
        .order("order_index", { ascending: true })
    : { data: [] as never[] };

  const lessonsByModule = new Map<string, BuilderLesson[]>();
  for (const lesson of (lessons ?? []) as {
    id: string;
    title: string;
    content_type: LessonContentType;
    order_index: number;
    module_id: string;
  }[]) {
    const list = lessonsByModule.get(lesson.module_id) ?? [];
    list.push({ id: lesson.id, title: lesson.title, contentType: lesson.content_type, orderIndex: lesson.order_index });
    lessonsByModule.set(lesson.module_id, list);
  }

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      type: course.type,
      isPublished: course.is_published,
    },
    flat: usesFlatSessions(course.type),
    modules: (modules ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      orderIndex: m.order_index,
      lessons: lessonsByModule.get(m.id) ?? [],
    })),
  };
}

/** Rows in lesson_progress or quiz_attempts for any of the given lessons — the delete-guard signal. */
async function countStudentRecords(lessonIds: string[]): Promise<number> {
  if (lessonIds.length === 0) return 0;
  const admin = createAdminSupabase();
  const [{ count: progress }, { count: attempts }] = await Promise.all([
    admin.from("lesson_progress").select("id", { count: "exact", head: true }).in("lesson_id", lessonIds),
    admin.from("quiz_attempts").select("id", { count: "exact", head: true }).in("lesson_id", lessonIds),
  ]);
  return (progress ?? 0) + (attempts ?? 0);
}

async function isPublishedWithActiveEnrollments(courseId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data: course } = await admin.from("courses").select("is_published").eq("id", courseId).maybeSingle();
  if (!course?.is_published) return false;
  const { count } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("status", "active");
  return (count ?? 0) > 0;
}

export type MutationResult =
  | { ok: true; id: string; warning?: string | null }
  | { ok: false; reason: "not-found" | "db-error" | "flat-type" }
  | { ok: false; reason: "needs-confirmation" | "blocked-published-active"; recordCount: number };

const REORDER_ACTIVE_ENROLLMENT_WARNING =
  "This program has active enrollments — reordering changes what students see next immediately.";

/**
 * The next order_index for a new module. NOT count() — count() drifts from a
 * dense sequence the moment any sibling has ever been deleted (e.g. three
 * rows at 0,1,2, delete the middle one, count() for a new insert returns 2,
 * colliding with the surviving row that's already AT 2). Taking max+1
 * instead is always safe: it can only ever land past every existing value,
 * gaps or not.
 */
async function nextModuleOrderIndex(admin: ReturnType<typeof createAdminSupabase>, courseId: string): Promise<number> {
  const { data } = await admin
    .from("modules")
    .select("order_index")
    .eq("course_id", courseId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.order_index + 1 : 0;
}

/** Same reasoning as nextModuleOrderIndex, for lessons within a module. */
async function nextLessonOrderIndex(admin: ReturnType<typeof createAdminSupabase>, moduleId: string): Promise<number> {
  const { data } = await admin
    .from("lessons")
    .select("order_index")
    .eq("module_id", moduleId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.order_index + 1 : 0;
}

export async function createModule(courseId: string, title: string): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: course } = await admin.from("courses").select("type").eq("id", courseId).maybeSingle();
  if (!course) return { ok: false, reason: "not-found" };
  if (usesFlatSessions(course.type)) return { ok: false, reason: "flat-type" };

  const orderIndex = await nextModuleOrderIndex(admin, courseId);
  const { data, error } = await admin
    .from("modules")
    .insert({ course_id: courseId, title, order_index: orderIndex })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export async function updateModule(moduleId: string, title: string): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("modules").update({ title }).eq("id", moduleId).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, id: data.id };
}

export async function deleteModule(moduleId: string, confirm = false): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: mod } = await admin.from("modules").select("id, course_id").eq("id", moduleId).maybeSingle();
  if (!mod) return { ok: false, reason: "not-found" };

  const { data: lessons } = await admin.from("lessons").select("id, pdf_file_id, documents").eq("module_id", moduleId);
  const lessonIds = (lessons ?? []).map((l) => l.id);
  const recordCount = await countStudentRecords(lessonIds);

  if (recordCount > 0) {
    if (await isPublishedWithActiveEnrollments(mod.course_id)) {
      return { ok: false, reason: "blocked-published-active", recordCount };
    }
    if (!confirm) return { ok: false, reason: "needs-confirmation", recordCount };
  }

  const { error } = await admin.from("modules").delete().eq("id", moduleId);
  if (error) return { ok: false, reason: "db-error" };

  const warning = await trashDriveFiles(
    collectLessonFileIds(
      (lessons ?? []).map((l) => ({
        pdfFileId: l.pdf_file_id,
        documents: (l.documents as unknown as Array<{ fileId: string }>) ?? [],
      })),
    ),
  );

  return { ok: true, id: moduleId, warning };
}

export async function reorderModules(courseId: string, orderedIds: string[]): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const updates = reorderIndexes(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, orderIndex }) =>
      admin.from("modules").update({ order_index: orderIndex }).eq("id", id).eq("course_id", courseId),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "db-error" };
  const warning = (await isPublishedWithActiveEnrollments(courseId)) ? REORDER_ACTIVE_ENROLLMENT_WARNING : null;
  return { ok: true, id: courseId, warning };
}

export async function createLesson(
  moduleId: string,
  title: string,
  contentType: LessonContentType,
): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const orderIndex = await nextLessonOrderIndex(admin, moduleId);
  const { data, error } = await admin
    .from("lessons")
    .insert({ module_id: moduleId, title, content_type: contentType, order_index: orderIndex })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export interface UpdateLessonInput {
  title?: string;
  contentType?: LessonContentType;
  videoUrl?: string;
  textContent?: string;
  resources?: LessonResourceLink[];
  pdfFileId?: string;
  documents?: LessonDocument[];
}

/** The autosave target for the Lesson Editor (Part D) — also used by Part C's plain rename. */
export async function updateLesson(lessonId: string, input: UpdateLessonInput): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from("lessons")
    .select("pdf_file_id, documents")
    .eq("id", lessonId)
    .maybeSingle();

  const patch: Database["public"]["Tables"]["lessons"]["Update"] = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.contentType !== undefined) patch.content_type = input.contentType;
  if (input.videoUrl !== undefined) patch.video_url = input.videoUrl || null;
  if (input.textContent !== undefined) patch.text_content = sanitizeLessonHtml(input.textContent);
  if (input.resources !== undefined) {
    patch.resource_urls = input.resources as unknown as Database["public"]["Tables"]["lessons"]["Update"]["resource_urls"];
  }
  if (input.pdfFileId !== undefined) patch.pdf_file_id = input.pdfFileId;
  if (input.documents !== undefined) {
    patch.documents = input.documents as unknown as Database["public"]["Tables"]["lessons"]["Update"]["documents"];
  }

  const { data, error } = await admin.from("lessons").update(patch).eq("id", lessonId).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };

  const warning = existing
    ? await trashDriveFiles(
        diffLessonFileIds(
          {
            pdfFileId: existing.pdf_file_id,
            documents: (existing.documents as unknown as LessonDocument[]) ?? [],
          },
          { pdfFileId: input.pdfFileId, documents: input.documents },
        ),
      )
    : null;

  return { ok: true, id: data.id, warning };
}

export async function deleteLesson(lessonId: string, confirm = false): Promise<MutationResult> {
  const admin = createAdminSupabase();

  const { data: lesson } = await admin
    .from("lessons")
    .select("id, module_id, modules!lessons_module_id_fkey(course_id)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return { ok: false, reason: "not-found" };

  const courseId = (lesson as unknown as { modules: { course_id: string } | null }).modules?.course_id;
  const recordCount = await countStudentRecords([lessonId]);

  if (recordCount > 0) {
    if (courseId && (await isPublishedWithActiveEnrollments(courseId))) {
      return { ok: false, reason: "blocked-published-active", recordCount };
    }
    if (!confirm) return { ok: false, reason: "needs-confirmation", recordCount };
  }

  const { error } = await admin.from("lessons").delete().eq("id", lessonId);
  if (error) return { ok: false, reason: "db-error" };
  return { ok: true, id: lessonId };
}

export async function reorderLessons(moduleId: string, orderedIds: string[]): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const updates = reorderIndexes(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, orderIndex }) =>
      admin.from("lessons").update({ order_index: orderIndex }).eq("id", id).eq("module_id", moduleId),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "db-error" };

  const { data: mod } = await admin.from("modules").select("course_id").eq("id", moduleId).maybeSingle();
  const warning =
    mod?.course_id && (await isPublishedWithActiveEnrollments(mod.course_id))
      ? REORDER_ACTIVE_ENROLLMENT_WARNING
      : null;
  return { ok: true, id: moduleId, warning };
}

// ---------------------------------------------------------------------------
// Part D — Lesson Editor (full lesson detail + quiz question CRUD)
// ---------------------------------------------------------------------------

export interface QuizQuestionRow {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  orderIndex: number;
}

export interface LessonResourceLink {
  label: string;
  url: string;
}

/** A Supporting Document — a PRIVATE Drive file, distinct from LessonResourceLink's public arbitrary links. */
export interface LessonDocument {
  name: string;
  fileId: string;
}

export interface LessonDetail {
  id: string;
  title: string;
  contentType: LessonContentType;
  videoUrl: string;
  textContent: string;
  pdfFileId: string | null;
  resources: LessonResourceLink[];
  documents: LessonDocument[];
  quizQuestions: QuizQuestionRow[];
}

/** Everything the Lesson Editor needs once a lesson is selected — deliberately not part of getBuilderState's initial payload, since text_content can be large. */
export async function getLessonDetail(lessonId: string): Promise<LessonDetail | null> {
  const admin = createAdminSupabase();

  const [{ data: lesson }, { data: questions }] = await Promise.all([
    admin
      .from("lessons")
      .select("id, title, content_type, video_url, text_content, pdf_file_id, resource_urls, documents")
      .eq("id", lessonId)
      .maybeSingle(),
    admin
      .from("quiz_questions")
      .select("id, question, options, correct_index, order_index")
      .eq("lesson_id", lessonId)
      .order("order_index", { ascending: true }),
  ]);
  if (!lesson) return null;

  return {
    id: lesson.id,
    title: lesson.title,
    contentType: lesson.content_type,
    videoUrl: lesson.video_url ?? "",
    textContent: lesson.text_content ?? "",
    pdfFileId: lesson.pdf_file_id,
    resources: (lesson.resource_urls as unknown as LessonResourceLink[] | null) ?? [],
    documents: (lesson.documents as unknown as LessonDocument[] | null) ?? [],
    quizQuestions: (questions ?? []).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options as unknown as string[],
      correctIndex: q.correct_index,
      orderIndex: q.order_index,
    })),
  };
}

export interface QuizQuestionInput {
  question: string;
  options: string[];
  correctIndex: number;
}

async function nextQuizQuestionOrderIndex(admin: ReturnType<typeof createAdminSupabase>, lessonId: string): Promise<number> {
  const { data } = await admin
    .from("quiz_questions")
    .select("order_index")
    .eq("lesson_id", lessonId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.order_index + 1 : 0;
}

export async function createQuizQuestion(lessonId: string, input: QuizQuestionInput): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const orderIndex = await nextQuizQuestionOrderIndex(admin, lessonId);
  const { data, error } = await admin
    .from("quiz_questions")
    .insert({
      lesson_id: lessonId,
      question: input.question,
      options: input.options,
      correct_index: input.correctIndex,
      order_index: orderIndex,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export async function updateQuizQuestion(id: string, input: Partial<QuizQuestionInput>): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const patch: Database["public"]["Tables"]["quiz_questions"]["Update"] = {};
  if (input.question !== undefined) patch.question = input.question;
  if (input.options !== undefined) patch.options = input.options;
  if (input.correctIndex !== undefined) patch.correct_index = input.correctIndex;

  const { data, error } = await admin.from("quiz_questions").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, id: data.id };
}

export async function deleteQuizQuestion(id: string): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("quiz_questions").delete().eq("id", id).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true, id: data.id };
}

export async function reorderQuizQuestions(lessonId: string, orderedIds: string[]): Promise<MutationResult> {
  const admin = createAdminSupabase();
  const updates = reorderIndexes(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, orderIndex }) =>
      admin.from("quiz_questions").update({ order_index: orderIndex }).eq("id", id).eq("lesson_id", lessonId),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, reason: "db-error" };
  return { ok: true, id: lessonId };
}
