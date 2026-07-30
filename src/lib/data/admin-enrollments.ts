import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendEnrollmentEmail } from "@/lib/emails/enrollment";
import { pushStatusToSheet } from "@/lib/gas/sheets-sync-client";

export type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];
export type CourseType = Database["public"]["Enums"]["course_type"];

export const ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  "pending",
  "reserved",
  "active",
  "rejected",
  "expired",
];

export type StatusFilter = EnrollmentStatus | "all";

export interface EnrollmentReviewRow {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  paymentAmountPkr: number | null;
  /** The URL itself stays on the detail view; the list only needs to know it exists. */
  hasScreenshot: boolean;
  paymentShortfallPkr: number | null;
  sheetPendingStatus: EnrollmentStatus | null;
  sheetPendingNote: string | null;
  student: { id: string; fullName: string; phone: string | null; email: string | null };
  course: { id: string; title: string; slug: string; type: CourseType; sheetId: string | null };
}

export interface EnrollmentReviewDetail extends EnrollmentReviewRow {
  paymentScreenshotUrl: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
}

/**
 * enrollments has TWO foreign keys into profiles (student_id and verified_by),
 * so PostgREST cannot infer which one to embed — both joins must name their
 * constraint explicitly or the query fails as ambiguous.
 */
const LIST_SELECT = `
  id, status, enrolled_at, payment_amount_pkr, payment_screenshot_url,
  payment_shortfall_pkr, sheet_pending_status, sheet_pending_note,
  student:profiles!enrollments_student_id_fkey (id, full_name, phone),
  course:courses!enrollments_course_id_fkey (id, title, slug, type, sheet_id)
` as const;

const DETAIL_SELECT = `
  ${LIST_SELECT},
  rejection_reason, verified_at,
  verifier:profiles!enrollments_verified_by_fkey (full_name)
` as const;

/**
 * Resolves auth emails for a set of user ids.
 *
 * public.profiles has no email column — email lives only in auth.users, which
 * PostgREST does not expose — so this is the one place the service-role client
 * is genuinely required. Emails are joined server-side and only the address
 * itself reaches the page; the admin client never crosses to the browser.
 *
 * listUsers is a full sweep because the Admin API has no "fetch these ids"
 * batch call. Fine at the platform's current size; if the user table grows
 * past a few thousand, replace this with a security-definer SQL function that
 * selects id/email from auth.users for a given uuid[].
 */
async function resolveEmails(userIds: string[]): Promise<Map<string, string>> {
  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  if (wanted.size === 0) return emails;

  const admin = createAdminSupabase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;

    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) emails.set(user.id, user.email);
    }
    if (emails.size === wanted.size) break;
    if (data.users.length < perPage) break;
  }

  return emails;
}

/**
 * The shape PostgREST returns for LIST_SELECT. Declared by hand because the
 * generated Database types don't model aliased embeds (`student:profiles!fk`),
 * so the client infers them as unknown.
 */
interface RawReviewRow {
  id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  payment_amount_pkr: number | null;
  payment_screenshot_url: string | null;
  payment_shortfall_pkr: number | null;
  sheet_pending_status: EnrollmentStatus | null;
  sheet_pending_note: string | null;
  student: { id: string; full_name: string; phone: string | null } | null;
  course: { id: string; title: string; slug: string; type: CourseType; sheet_id: string | null } | null;
}

interface RawDetailRow extends RawReviewRow {
  rejection_reason: string | null;
  verified_at: string | null;
  verifier: { full_name: string } | null;
}

function toRow(row: RawReviewRow, emails: Map<string, string>): EnrollmentReviewRow {
  return {
    id: row.id,
    status: row.status,
    enrolledAt: row.enrolled_at,
    paymentAmountPkr: row.payment_amount_pkr,
    hasScreenshot: Boolean(row.payment_screenshot_url),
    paymentShortfallPkr: row.payment_shortfall_pkr,
    sheetPendingStatus: row.sheet_pending_status,
    sheetPendingNote: row.sheet_pending_note,
    student: {
      id: row.student?.id ?? "",
      fullName: row.student?.full_name?.trim() || "Unnamed student",
      phone: row.student?.phone ?? null,
      email: (row.student?.id ? emails.get(row.student.id) : null) ?? null,
    },
    course: {
      id: row.course?.id ?? "",
      title: row.course?.title ?? "Unknown course",
      slug: row.course?.slug ?? "",
      type: row.course?.type as CourseType,
      sheetId: row.course?.sheet_id ?? null,
    },
  };
}

/** The review queue. Admin RLS (0002) already permits reading every row. */
export async function listEnrollmentsForReview(
  filter: StatusFilter = "pending",
): Promise<EnrollmentReviewRow[]> {
  const supabase = await createServerSupabase();

  let query = supabase.from("enrollments").select(LIST_SELECT);
  if (filter !== "all") query = query.eq("status", filter);

  const { data } = await query.order("enrolled_at", { ascending: false });
  if (!data) return [];

  const rows = data as unknown as RawReviewRow[];
  const emails = await resolveEmails(
    rows.map((r) => r.student?.id).filter((id): id is string => Boolean(id)),
  );

  return rows.map((row) => toRow(row, emails));
}

/** A single enrollment with every review-only field. Null when the id is unknown. */
export async function getEnrollmentForReview(id: string): Promise<EnrollmentReviewDetail | null> {
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("enrollments")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const row = data as unknown as RawDetailRow;
  const emails = await resolveEmails(row.student?.id ? [row.student.id] : []);

  return {
    ...toRow(row, emails),
    paymentScreenshotUrl: row.payment_screenshot_url,
    rejectionReason: row.rejection_reason,
    verifiedAt: row.verified_at,
    verifiedByName: row.verifier?.full_name?.trim() || null,
  };
}

/**
 * Row counts per status, for the filter pills and the dashboard banner.
 * Tallied in JS off a single status-only select rather than five count
 * queries — cheaper at this table size, and keeps the numbers consistent
 * with each other by coming from one snapshot.
 */
export async function countEnrollmentsByStatus(): Promise<
  Record<StatusFilter, number>
> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("enrollments").select("status");

  const counts = {
    pending: 0,
    reserved: 0,
    active: 0,
    rejected: 0,
    expired: 0,
    all: 0,
  } satisfies Record<StatusFilter, number>;

  for (const row of data ?? []) {
    counts[row.status] += 1;
    counts.all += 1;
  }
  return counts;
}

/**
 * Enrollments activated since the start of the current calendar month, for the
 * "Approved This Month" stat card. Counts on verified_at (when an admin acted),
 * not enrolled_at (when the student applied).
 */
export async function countApprovedThisMonth(): Promise<number> {
  const supabase = await createServerSupabase();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("verified_at", monthStart);
  return count ?? 0;
}

/** Pending count for the admin dashboard's "awaiting verification" banner. */
export async function countPendingEnrollments(): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export type ApplyStatusResult =
  | { ok: true; id: string; status: EnrollmentStatus }
  | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

/**
 * The single place that commits an enrollment status transition. Used by the
 * admin PATCH route (a human decision), the sheets-sync webhook's auto-apply
 * path (a non-downgrade sheet edit), and the sheet-sync confirm route (an
 * admin ratifying a parked downgrade) — one whitelist, one email-firing
 * point, one place that pushes the result back to a linked sheet.
 *
 * Column whitelist is deliberate: the "enrollments: admin update" RLS policy
 * (0002) has no WITH CHECK, so an admin-privileged write can touch ANY
 * column. Nothing below the app layer constrains this — it is constrained
 * here.
 */
export async function applyEnrollmentStatus(params: {
  enrollmentId: string;
  targetStatus: EnrollmentStatus;
  verifiedBy: string | null;
  rejectionReason?: string | null;
  clearShortfall?: boolean;
  emailKind?: "approved" | "reserved" | "rejected" | null;
}): Promise<ApplyStatusResult> {
  const enrollment = await getEnrollmentForReview(params.enrollmentId);
  if (!enrollment) return { ok: false, reason: "not-found" };
  if (enrollment.status === params.targetStatus) {
    return { ok: false, reason: "already-in-status" };
  }

  const patch = {
    status: params.targetStatus,
    verified_by: params.verifiedBy,
    verified_at: new Date().toISOString(),
    rejection_reason: params.rejectionReason ?? null,
    sheet_pending_status: null,
    sheet_pending_note: null,
    ...(params.clearShortfall ? { payment_shortfall_pkr: null } : {}),
  };

  const admin = createAdminSupabase();
  const { data: updated, error } = await admin
    .from("enrollments")
    .update(patch)
    .eq("id", params.enrollmentId)
    .select("id, status")
    .single();

  if (error || !updated) return { ok: false, reason: "db-error" };

  if (params.emailKind) {
    await sendEnrollmentEmail(params.emailKind, enrollment.student.email, {
      fullName: enrollment.student.fullName,
      courseTitle: enrollment.course.title,
      courseSlug: enrollment.course.slug,
      rejectionReason: params.rejectionReason ?? null,
    });
  }

  if (enrollment.course.sheetId && enrollment.student.email) {
    await pushStatusToSheet({
      sheetId: enrollment.course.sheetId,
      email: enrollment.student.email,
      status: params.targetStatus,
    });
  }

  return { ok: true, id: updated.id, status: updated.status };
}
