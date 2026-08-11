import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";

export type CourseType = Database["public"]["Enums"]["course_type"];
export type CourseStatus = Database["public"]["Enums"]["course_status"];
export type LessonContentType = Database["public"]["Enums"]["lesson_content_type"];

export const COURSE_TYPES = ["course", "workshop", "webinar", "mentorship"] as const satisfies readonly CourseType[];
export const COURSE_STATUSES = ["draft", "open", "closed", "archived"] as const satisfies readonly CourseStatus[];
export const LESSON_CONTENT_TYPES = ["video", "text", "pdf"] as const satisfies readonly LessonContentType[];

/**
 * Types that store their sessions inside one auto-created, hidden module —
 * see ensureDefaultModule() in src/lib/data/admin-lms.ts. Only "course" shows
 * module UI in the builder; everything else is a flat session list.
 */
export const FLAT_TYPES = ["workshop", "webinar", "mentorship"] as const satisfies readonly CourseType[];

export function usesFlatSessions(type: CourseType): boolean {
  return (FLAT_TYPES as readonly CourseType[]).includes(type);
}

/**
 * Business-convention session counts per type (webinar=1, workshop 3+,
 * course 6+). These are advisory, not enforced — real programs have
 * exceptions — so publish-eligibility only warns below norm, never blocks on
 * count. The only hard block is zero sessions (see publishEligibility).
 */
export const EXPECTED_SESSION_COUNT: Record<CourseType, { min: number; label: string }> = {
  webinar: { min: 1, label: "Webinars are usually exactly 1 session." },
  workshop: { min: 3, label: "Workshops are usually 3 or more sessions." },
  course: { min: 6, label: "Courses are usually 6 or more sessions." },
  mentorship: { min: 1, label: "" },
};

/** Turns "Advanced Data Analysis with Excel" into "advanced-data-analysis-with-excel". */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const slug = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only");

/** Exported so other admin schemas (e.g. admin-mentor.ts) share the same "empty string -> undefined" URL coercion instead of redefining it. */
export const url = z
  .string()
  .trim()
  .url("Must be a full URL starting with https://")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

export const courseCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  type: z.enum(COURSE_TYPES),
});

/**
 * features/outcomes/faqs are `.optional()`, not `.default([])`. The
 * Configuration form (ported from "Admin: Course Management Detail") doesn't
 * expose these — they're marketing-page arrays edited elsewhere — so
 * omitting them here must mean "leave alone," not "wipe to empty." A
 * `.default([])` would silently erase real content on PPC/MDC's next save.
 * See updateCourseConfig() in src/lib/data/admin-lms.ts.
 */
export const courseConfigSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  type: z.enum(COURSE_TYPES),
  tagline: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(COURSE_STATUSES),
  pricePkr: z.number().int().nonnegative(),
  level: z.string().trim().max(50).optional(),
  /** Free text, e.g. "8 Weeks" / "4 Days" — the real Stitch screen ("Admin: Course Management Detail") is a plain text input, not a week count. */
  durationText: z.string().trim().max(50).optional(),
  timings: z.string().trim().max(200).optional(),
  features: z.array(z.string().trim().min(1)).max(20).optional(),
  outcomes: z.array(z.string().trim().min(1)).max(20).optional(),
  registerUrl: url,
  thumbnailUrl: url,
  bannerUrl: url,
  mentorName: z.string().trim().max(120).optional(),
  mentorTitle: z.string().trim().max(120).optional(),
  mentorBio: z.string().trim().max(2000).optional(),
  mentorAvatarUrl: url,
  gasWebappUrl: url,
  faqs: z
    .array(z.object({ question: z.string().trim().min(1), answer: z.string().trim().min(1) }))
    .max(30)
    .optional(),
});

export const moduleCreateSchema = z.object({
  title: z.string().trim().min(1, "Module title is required").max(150),
});

export const moduleUpdateSchema = z.object({
  title: z.string().trim().min(1, "Module title is required").max(150),
});

export const lessonCreateSchema = z.object({
  title: z.string().trim().min(1, "Session title is required").max(200),
  contentType: z.enum(LESSON_CONTENT_TYPES).default("text"),
});

export const lessonUpdateSchema = z.object({
  title: z.string().trim().min(1, "Session title is required").max(200).optional(),
  contentType: z.enum(LESSON_CONTENT_TYPES).optional(),
  videoUrl: url,
  textContent: z.string().max(200_000).optional(),
  resources: z
    .array(z.object({ label: z.string().trim().min(1).max(150), url: z.string().trim().url() }))
    .max(20)
    .optional(),
  /** Drive file ID of the private lesson PDF (content_type="pdf"), set by /api/admin/uploads/document. */
  pdfFileId: z.string().trim().min(1).max(200).optional(),
  /** Supporting Documents — private Drive files, distinct from the public `resources` links above. */
  documents: z
    .array(z.object({ name: z.string().trim().min(1).max(200), fileId: z.string().trim().min(1).max(200) }))
    .max(20)
    .optional(),
});

export const quizQuestionCreateSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(1000),
  options: z.array(z.string().trim().min(1)).min(2).max(6),
  correctIndex: z.number().int().nonnegative(),
});

export const quizQuestionUpdateSchema = quizQuestionCreateSchema.partial();

/** Every reorder endpoint takes the complete ordered array of sibling IDs. */
export const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});

/**
 * Rewrites order_index to a dense 0..n-1 sequence matching orderedIds. Pure
 * so it can be unit-tested without touching the DB — the actual persistence
 * is a bulk update in src/lib/data/admin-lms.ts.
 */
export function reorderIndexes(orderedIds: string[]): Array<{ id: string; orderIndex: number }> {
  return orderedIds.map((id, orderIndex) => ({ id, orderIndex }));
}

export type PublishCheck =
  | { ok: true; warning: string | null }
  | { ok: false; reason: string };

/**
 * Hard-blocks publishing with zero sessions (portal/[slug]/page.tsx dead-ends
 * an active student on "no lessons yet" otherwise). Below-norm session
 * counts only warn — these are business conventions with real exceptions,
 * not invariants.
 */
export function publishEligibility(type: CourseType, sessionCount: number): PublishCheck {
  if (sessionCount === 0) {
    return { ok: false, reason: "Add at least one session before publishing." };
  }
  const { min, label } = EXPECTED_SESSION_COUNT[type];
  if (sessionCount < min && label) {
    return { ok: true, warning: `${label} This program has ${sessionCount}.` };
  }
  return { ok: true, warning: null };
}

export type TypeSwitchCheck = { ok: true } | { ok: false; reason: string };

/**
 * Only "course" shows module UI; workshop/webinar/mentorship collapse into
 * one hidden module (see ensureDefaultModule()). Switching into a flat type
 * is only safe when the course already has 0 or 1 modules — merging multiple
 * real modules automatically would destroy curriculum structure, so that
 * case is blocked and left to the admin to resolve by hand first.
 */
export function typeSwitchEligibility(
  nextType: CourseType,
  currentModuleCount: number,
): TypeSwitchCheck {
  if (!usesFlatSessions(nextType)) return { ok: true };
  if (currentModuleCount <= 1) return { ok: true };
  return {
    ok: false,
    reason: `This course has ${currentModuleCount} modules. Merge them into one before changing its type.`,
  };
}
