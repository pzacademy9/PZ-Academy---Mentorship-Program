import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { adminNotificationSchema } from "@/lib/validations/notification";

/** Guards against an accidental send to the entire user base in one click. */
const MAX_RECIPIENTS = 5000;

/**
 * Sends an admin-composed notification to one student, everyone active on a
 * course, or every student.
 *
 * These are the notifications the database cannot generate for itself — there
 * is no row change to hang a trigger off (0015 covers the automatic ones). The
 * insert goes through the service-role client because "notifications" has no
 * INSERT policy at all: students must never be able to forge notifications, so
 * the only writers are security-definer triggers and this route.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = adminNotificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  // Recipient resolution runs on the admin's own session client so it is still
  // subject to admin RLS — it reads no more than the panel already shows.
  let recipientIds: string[] = [];

  if (input.audience === "student") {
    const { data } = await auth.supabase
      .from("profiles")
      .select("id")
      .eq("id", input.studentId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    recipientIds = [data.id];
  } else if (input.audience === "course") {
    // Active enrollments only: someone whose payment was rejected should not
    // receive "your session starts in an hour".
    const { data } = await auth.supabase
      .from("enrollments")
      .select("student_id")
      .eq("course_id", input.courseId)
      .eq("status", "active");
    // Array.from rather than [...set]: tsconfig targets ES5 here, so spreading
    // a Set needs downlevelIteration.
    recipientIds = Array.from(new Set((data ?? []).map((row) => row.student_id)));
  } else {
    const { data } = await auth.supabase.from("profiles").select("id").eq("role", "student");
    recipientIds = (data ?? []).map((row) => row.id);
  }

  if (recipientIds.length === 0) {
    return NextResponse.json({ error: "No recipients matched" }, { status: 400 });
  }
  if (recipientIds.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (${recipientIds.length}). Narrow the audience.` },
      { status: 400 },
    );
  }

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type: "admin_message",
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  }));

  const admin = createAdminSupabase();
  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    return NextResponse.json({ error: "Could not send notification" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: rows.length }, { status: 201 });
}
