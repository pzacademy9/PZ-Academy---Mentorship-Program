import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { resolveSessionsTotal } from "@/lib/data/session-slots";
import type { MentorPackage } from "@/lib/data/mentors";

export type SessionStatus = Database["public"]["Enums"]["session_status"];

export interface SessionRow {
  id: string;
  bookingId: string | null;
  studentId: string;
  mentorId: string;
  status: SessionStatus;
  scheduledAt: string | null;
  durationMin: number | null;
}

function toSessionRow(row: {
  id: string;
  booking_id: string | null;
  student_id: string;
  mentor_id: string;
  status: SessionStatus;
  scheduled_at: string | null;
  duration_min: number | null;
}): SessionRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    studentId: row.student_id,
    mentorId: row.mentor_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    durationMin: row.duration_min,
  };
}

const SELECT = "id, booking_id, student_id, mentor_id, status, scheduled_at, duration_min";

export async function listSessionsForBooking(bookingId: string): Promise<SessionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("sessions").select(SELECT).eq("booking_id", bookingId).order("scheduled_at");
  return (data ?? []).map(toSessionRow);
}

export type CreateSessionResult =
  | { ok: true; sessionsTotal: number; created: number }
  | { ok: false; reason: "booking-not-found" | "not-confirmed" | "mentor-not-linked" | "student-not-linked" | "already-scheduled" | "db-error" };

/**
 * The admin manual-override path (service-role, no RPC — the caller's own
 * session isn't what's being written, so there's nothing auth.uid()-scoped
 * about this write). Creates session #1 already dated; sessions 2..N (if
 * the package has more) are created with scheduled_at = null, status =
 * 'pending', to be dated individually later via a future "Set date" action
 * on this table (not built in this subsystem — see the design spec's
 * out-of-scope list for rescheduling).
 */
export async function createSessionForBooking(params: {
  bookingId: string;
  scheduledAt: string;
}): Promise<CreateSessionResult> {
  const admin = createAdminSupabase();

  const { data: booking } = await admin
    .from("mentorship_bookings")
    .select("id, student_id, mentor_slug, package_name, status, sessions_total")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, reason: "booking-not-found" };
  if (booking.status !== "confirmed") return { ok: false, reason: "not-confirmed" };
  if (!booking.student_id) return { ok: false, reason: "student-not-linked" };

  const { count: existingCount } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", booking.id);
  if ((existingCount ?? 0) > 0) return { ok: false, reason: "already-scheduled" };

  const { data: mentor } = await admin
    .from("mentors")
    .select("id, profile_id, packages, session_duration_minutes")
    .eq("slug", booking.mentor_slug)
    .maybeSingle();

  if (!mentor || !mentor.profile_id) return { ok: false, reason: "mentor-not-linked" };

  const sessionsTotal =
    booking.sessions_total ?? resolveSessionsTotal(booking.package_name, (mentor.packages as unknown as MentorPackage[]) ?? []);

  if (booking.sessions_total === null) {
    await admin.from("mentorship_bookings").update({ sessions_total: sessionsTotal }).eq("id", booking.id);
  }

  const rows = Array.from({ length: sessionsTotal }, (_, i) => ({
    student_id: booking.student_id as string,
    mentor_id: mentor.profile_id as string,
    booking_id: booking.id,
    status: i === 0 ? ("confirmed" as const) : ("pending" as const),
    scheduled_at: i === 0 ? params.scheduledAt : null,
    duration_min: mentor.session_duration_minutes,
  }));

  const { error, data: inserted } = await admin.from("sessions").insert(rows).select("id");
  if (error) return { ok: false, reason: "db-error" };

  return { ok: true, sessionsTotal, created: inserted?.length ?? 0 };
}

export type SetSessionStatusResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function setSessionStatus(sessionId: string, status: "completed" | "cancelled"): Promise<SetSessionStatusResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("sessions").update({ status }).eq("id", sessionId).select("id").maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (!data) return { ok: false, reason: "not-found" };
  return { ok: true };
}

export interface UpcomingSession {
  id: string;
  studentId: string;
  studentName: string;
  scheduledAt: string;
  sessionNumber: number;
  sessionsTotal: number;
  packageName: string;
}

/** Upcoming (confirmed, future) sessions for a mentor's own dashboard, newest-first by date ascending. */
export async function listUpcomingSessionsForMentor(mentorProfileId: string): Promise<UpcomingSession[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("sessions")
    .select("id, student_id, scheduled_at, booking_id, profiles!sessions_student_id_fkey(full_name)")
    .eq("mentor_id", mentorProfileId)
    .eq("status", "confirmed")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (!data || data.length === 0) return [];

  const bookingIds = Array.from(new Set(data.map((s) => s.booking_id).filter((id): id is string => id !== null)));
  const { data: bookings } = await admin.from("mentorship_bookings").select("id, package_name, sessions_total").in("id", bookingIds);
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  const results: UpcomingSession[] = [];
  for (const row of data) {
    const booking = row.booking_id ? bookingById.get(row.booking_id) : undefined;
    const siblingsForBooking = data.filter((s) => s.booking_id === row.booking_id);
    const sessionNumber = siblingsForBooking.findIndex((s) => s.id === row.id) + 1;

    results.push({
      id: row.id,
      studentId: row.student_id,
      studentName: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
      scheduledAt: row.scheduled_at as string,
      sessionNumber,
      sessionsTotal: booking?.sessions_total ?? 1,
      packageName: booking?.package_name ?? "",
    });
  }
  return results;
}

export interface MentorStudent {
  studentId: string;
  studentName: string;
  completedCount: number;
  totalCount: number;
}

/** Distinct students this mentor has any session with, most-recently-active first. */
export async function listStudentsForMentor(mentorProfileId: string): Promise<MentorStudent[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("sessions")
    .select("student_id, status, profiles!sessions_student_id_fkey(full_name)")
    .eq("mentor_id", mentorProfileId)
    .in("status", ["confirmed", "completed"]);

  if (!data) return [];

  const byStudent = new Map<string, MentorStudent>();
  for (const row of data) {
    const existing = byStudent.get(row.student_id) ?? {
      studentId: row.student_id,
      studentName: (row.profiles as unknown as { full_name: string } | null)?.full_name ?? "Student",
      completedCount: 0,
      totalCount: 0,
    };
    existing.totalCount += 1;
    if (row.status === "completed") existing.completedCount += 1;
    byStudent.set(row.student_id, existing);
  }
  return Array.from(byStudent.values());
}

export interface MentorDashboardStats {
  activeStudents: number;
  sessionsThisMonth: number;
  pendingBookings: number;
}

export async function getMentorDashboardStats(mentorSlug: string, mentorProfileId: string): Promise<MentorDashboardStats> {
  const admin = createAdminSupabase();

  const students = await listStudentsForMentor(mentorProfileId);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const { count: sessionsThisMonth } = await admin
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("mentor_id", mentorProfileId)
    .in("status", ["confirmed", "completed"])
    .gte("scheduled_at", monthStart)
    .lt("scheduled_at", monthEnd);

  const { data: confirmedBookings } = await admin
    .from("mentorship_bookings")
    .select("id, sessions_total")
    .eq("mentor_slug", mentorSlug)
    .eq("status", "confirmed");

  let pendingBookings = 0;
  const bookingIds = (confirmedBookings ?? []).map((b) => b.id);
  if (bookingIds.length > 0) {
    const { data: scheduledSessions } = await admin
      .from("sessions")
      .select("booking_id")
      .in("booking_id", bookingIds)
      .not("scheduled_at", "is", null);

    const scheduledCountByBooking = new Map<string, number>();
    for (const session of scheduledSessions ?? []) {
      if (session.booking_id !== null) {
        const count = (scheduledCountByBooking.get(session.booking_id) ?? 0) + 1;
        scheduledCountByBooking.set(session.booking_id, count);
      }
    }

    for (const booking of confirmedBookings ?? []) {
      const scheduledCount = scheduledCountByBooking.get(booking.id) ?? 0;
      const total = booking.sessions_total ?? 1;
      if (scheduledCount < total) pendingBookings += 1;
    }
  }

  return {
    activeStudents: students.length,
    sessionsThisMonth: sessionsThisMonth ?? 0,
    pendingBookings,
  };
}

import type { createServerSupabase } from "@/lib/supabase/server";
import type { BookSessionsInput } from "@/lib/validations/mentorship-sessions";

export type BookSessionsResult = { ok: true; created: number } | { ok: false; message: string };

/**
 * The student's own self-serve booking commit. Goes through the caller's
 * own session client (not admin) so book_mentorship_sessions's
 * `student_id = auth.uid()` ownership check resolves to the real caller —
 * same convention as updateOwnMentorProfile/updateOwnMentorAvailability.
 */
export async function bookMentorshipSessions(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: BookSessionsInput,
): Promise<BookSessionsResult> {
  const { data, error } = await supabase.rpc("book_mentorship_sessions", {
    p_booking_id: input.bookingId,
    p_slots: input.slots,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, created: data ?? 0 };
}
