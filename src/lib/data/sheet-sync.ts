// src/lib/data/sheet-sync.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Resolves which course a sheet feeds. Null when no course has claimed this sheet_id. */
export async function getCourseBySheetId(
  sheetId: string,
): Promise<{ id: string; slug: string; title: string } | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("courses")
    .select("id, slug, title")
    .eq("sheet_id", sheetId)
    .maybeSingle();
  return data;
}

/**
 * Finds the auth.users id for an email, or null if no account exists yet.
 *
 * auth.admin has no "find by email" call, only paginated listUsers, so this
 * sweeps pages and exits early on a match — the same approach and the same
 * caveat as resolveEmails() in admin-enrollments.ts: replace with a
 * security-definer SQL function if the user table grows past a few thousand.
 */
export async function findStudentIdByEmail(email: string): Promise<string | null> {
  const admin = createAdminSupabase();
  const target = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;

    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Stages a submission whose email doesn't match any account yet. Resolved
 * automatically the moment that email signs up — see migration 0017.
 */
export async function insertSheetLead(input: {
  sheetId: string;
  courseId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  paymentConfirmation: string;
  amountPkr: number | null;
  rawRow: unknown;
}): Promise<void> {
  const admin = createAdminSupabase();
  await admin.from("sheet_leads").insert({
    sheet_id: input.sheetId,
    course_id: input.courseId,
    row_email: input.email,
    row_name: input.name ?? null,
    row_phone: input.phone ?? null,
    payment_confirmation: input.paymentConfirmation,
    payment_amount_pkr: input.amountPkr,
    raw_row: input.rawRow as never,
  });
}

/**
 * Notifies every admin/super_admin that a sheet edit requested a downgrade
 * that needs human confirmation. Reuses the existing notifications table —
 * no new notification infrastructure, same insert pattern as the admin
 * broadcast route in src/app/api/admin/notifications/route.ts.
 */
export async function notifyAdminsOfSheetDowngrade(input: {
  enrollmentId: string;
  studentName: string;
  courseTitle: string;
  from: string;
  to: string;
}): Promise<void> {
  const admin = createAdminSupabase();
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "super_admin"]);

  const recipientIds = (admins ?? []).map((row) => row.id);
  if (recipientIds.length === 0) return;

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type: "sheet_sync_pending",
    title: "Sheet requests a downgrade",
    body: `${input.studentName} — ${input.courseTitle}: sheet requests ${input.from} → ${input.to}. Review before it takes effect.`,
    link: `/dashboard/admin/enrollments/${input.enrollmentId}`,
  }));

  await admin.from("notifications").insert(rows);
}
