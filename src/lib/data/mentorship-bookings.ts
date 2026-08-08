import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";
import { pushMentorshipStatusToSheet, pushMentorshipDelete } from "@/lib/gas/mentorship-sync-client";

export type MentorshipBookingStatus = Database["public"]["Enums"]["mentorship_booking_status"];

export interface MentorshipBookingRow {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  mentorSlug: string;
  mentorName: string;
  packageName: string;
  goals: string | null;
  hasScreenshot: boolean;
  paymentScreenshotUrl: string | null;
  status: MentorshipBookingStatus;
  cancellationReason: string | null;
  createdAt: string;
}

interface RawBookingRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  mentor_slug: string;
  mentor_name: string;
  package_name: string;
  goals: string | null;
  payment_screenshot_url: string | null;
  status: MentorshipBookingStatus;
  cancellation_reason: string | null;
  created_at: string;
}

function toRow(row: RawBookingRow): MentorshipBookingRow {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    mentorSlug: row.mentor_slug,
    mentorName: row.mentor_name,
    packageName: row.package_name,
    goals: row.goals,
    hasScreenshot: Boolean(row.payment_screenshot_url),
    paymentScreenshotUrl: row.payment_screenshot_url,
    status: row.status,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, full_name, email, phone, mentor_slug, mentor_name, package_name, goals, payment_screenshot_url, status, cancellation_reason, created_at";

/** The admin review list — reads via the admin client, mirroring listEnrollmentsForReview's role. */
export async function listBookingsForReview(): Promise<MentorshipBookingRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentorship_bookings").select(SELECT).order("created_at", { ascending: false });
  return (data ?? []).map((row) => toRow(row as RawBookingRow));
}

/** A logged-in student's own bookings, for /dashboard/sessions. RLS scopes this to auth.uid(). */
export async function listMyBookings(studentId: string): Promise<MentorshipBookingRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("mentorship_bookings")
    .select(SELECT)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => toRow(row as RawBookingRow));
}

export async function countMyBookings(studentId: string): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  return count ?? 0;
}

export interface InsertBookingInput {
  studentId: string | null;
  fullName: string;
  email: string;
  phone: string;
  mentorSlug: string;
  mentorName: string;
  packageName: string;
  goals?: string | null;
  paymentScreenshotUrl?: string | null;
}

export async function insertBooking(input: InsertBookingInput): Promise<{ id: string }> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("mentorship_bookings")
    .insert({
      student_id: input.studentId,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      mentor_slug: input.mentorSlug,
      mentor_name: input.mentorName,
      package_name: input.packageName,
      goals: input.goals ?? null,
      payment_screenshot_url: input.paymentScreenshotUrl ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not insert booking");
  return { id: data.id };
}

export type ApplyBookingStatusResult =
  | { ok: true; id: string; status: MentorshipBookingStatus }
  | { ok: false; reason: "not-found" | "already-in-status" | "db-error" };

/**
 * The single place that commits a booking status transition — the admin
 * PATCH route and the mentorship-sync webhook's status-change path both call
 * this, mirroring applyEnrollmentStatus in src/lib/data/admin-enrollments.ts.
 */
export async function applyBookingStatus(params: {
  bookingId: string;
  targetStatus: MentorshipBookingStatus;
  cancellationReason?: string | null;
  emailKind?: "bookingConfirmed" | "bookingCancelled" | null;
}): Promise<ApplyBookingStatusResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentorship_bookings")
    .select("id, status, full_name, email, mentor_name")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };
  if (existing.status === params.targetStatus) return { ok: false, reason: "already-in-status" };

  const { data: updated, error } = await admin
    .from("mentorship_bookings")
    .update({
      status: params.targetStatus,
      cancellation_reason: params.targetStatus === "cancelled" ? (params.cancellationReason ?? null) : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", params.bookingId)
    .select("id, status")
    .single();

  if (error || !updated) return { ok: false, reason: "db-error" };

  if (params.emailKind) {
    await sendMentorshipEmail(params.emailKind, existing.email, {
      fullName: existing.full_name,
      mentorName: existing.mentor_name,
      cancellationReason: params.cancellationReason ?? null,
    });
  }

  await pushMentorshipStatusToSheet({ sheetKind: "booking", email: existing.email, status: updated.status });

  return { ok: true, id: updated.id, status: updated.status };
}

export type DeleteBookingResult =
  | { ok: true; sheetDeleteMessage: string | null }
  | { ok: false; reason: "not-found" | "db-error" };

/**
 * Deletes the booking from Supabase first — that's the authoritative delete
 * from the admin's perspective. The Sheet-side delete is attempted
 * regardless of whether the Supabase delete already succeeded (it always
 * has, by this point), and its outcome is reported back so the admin knows
 * if the Sheet row needs manual cleanup, and why.
 */
export async function deleteBooking(bookingId: string): Promise<DeleteBookingResult> {
  const admin = createAdminSupabase();
  const { data: existing, error: readError } = await admin
    .from("mentorship_bookings")
    .select("id, email, created_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (readError) return { ok: false, reason: "db-error" };
  if (!existing) return { ok: false, reason: "not-found" };

  const { error } = await admin.from("mentorship_bookings").delete().eq("id", bookingId);
  if (error) return { ok: false, reason: "db-error" };

  const sheetResult = await pushMentorshipDelete({
    sheetKind: "booking",
    email: existing.email,
    timestamp: existing.created_at,
  });

  return { ok: true, sheetDeleteMessage: sheetResult.ok ? null : (sheetResult.message ?? "Unknown error") };
}
