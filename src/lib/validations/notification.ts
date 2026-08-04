import { z } from "zod";

/**
 * Admin-composed notifications. Unlike the enrollment and lesson-unlock
 * notifications — which the database produces via triggers (0015) — these have
 * no row change to react to, so they arrive as an explicit admin action.
 */

const title = z.string().trim().min(3, "Title is required").max(120, "Title is too long");
const body = z.string().trim().max(1000, "Message is too long").optional();
/**
 * Internal paths only. An absolute URL here would let an admin turn a trusted
 * in-app notification into an off-site link, so the shape is pinned to a
 * same-origin path.
 *
 * The `(?![/\\])` after the leading slash is load-bearing. Without it,
 * "//evil.example.com" passes — it starts with "/" and "/" is a legal path
 * character — but browsers read a protocol-relative "//host" as an ABSOLUTE
 * url, so router.push() would navigate straight off-site. A backslash is
 * excluded for the same reason: some browsers normalise "/\" to "//".
 * Verified by the "rejects protocol-relative" case in
 * tests/notification.schema.test.ts.
 */
const link = z
  .string()
  .trim()
  .regex(
    /^\/(?![/\\])[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/,
    "Link must be an internal path like /courses",
  )
  .max(300)
  .optional();

export const adminNotificationSchema = z.discriminatedUnion("audience", [
  z.object({
    audience: z.literal("student"),
    studentId: z.string().uuid("Pick a student"),
    title,
    body,
    link,
  }),
  z.object({
    audience: z.literal("course"),
    courseId: z.string().uuid("Pick a course"),
    title,
    body,
    link,
  }),
  z.object({
    audience: z.literal("all"),
    title,
    body,
    link,
  }),
]);

export type AdminNotificationInput = z.infer<typeof adminNotificationSchema>;
export type NotificationAudience = AdminNotificationInput["audience"];

/**
 * Marks notifications read. An omitted id means "all of mine" — the bell's
 * "Mark all read" control — so the two cases share one endpoint.
 */
export const markNotificationsReadSchema = z.object({
  id: z.string().uuid().optional(),
});

export const AUDIENCE_LABELS: Record<NotificationAudience, string> = {
  student: "One student",
  course: "Everyone on a course",
  all: "All students",
};
