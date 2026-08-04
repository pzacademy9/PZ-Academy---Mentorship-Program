import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getCourseBySlug } from "@/lib/data/lms";
import { createEnrollmentSchema } from "@/lib/validations/enrollment";
import { sendEnrollmentEmail } from "@/lib/emails/enrollment";

/** Statuses a student may resubmit from — the review is over and it didn't stick. */
const RESUBMITTABLE = new Set(["rejected", "expired", "reserved"]);

/**
 * Creates — or re-opens — a pending enrollment for the caller. `status` is
 * always 'pending' here, regardless of what the client sends; migration 0013
 * also enforces this at the RLS layer, but the redundant server-side pin keeps
 * the intent explicit and gives a clean 200 instead of a Postgres error.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createEnrollmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { courseSlug, paymentAmountPkr, paymentScreenshotUrl } = parsed.data;

  const course = await getCourseBySlug(courseSlug);
  if (!course || !course.isPublished) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();

  const notifyReceived = () =>
    sendEnrollmentEmail("received", user.email, {
      fullName: user.user_metadata?.full_name ?? "",
      courseTitle: course.title,
      courseSlug: course.slug,
    });

  if (existing) {
    // Already awaiting review, or already active — nothing to do.
    if (!RESUBMITTABLE.has(existing.status)) {
      return NextResponse.json({ id: existing.id, status: existing.status });
    }

    /*
     * Re-open a closed enrollment rather than inserting a second one.
     * enrollments has unique (student_id, course_id), so a rejected student
     * could never insert again — before this, rejection was a permanent dead
     * end with no way back except an admin editing the row by hand.
     *
     * This has to go through the service-role client: 0013 gave students an
     * INSERT policy only, and there is no student UPDATE policy on
     * enrollments at all. The .eq("student_id", user.id) filter is what keeps
     * that privilege scoped to the caller's own row — do not remove it.
     */
    const admin = createAdminSupabase();
    const { data: reopened, error: reopenError } = await admin
      .from("enrollments")
      .update({
        status: "pending",
        payment_amount_pkr: paymentAmountPkr,
        payment_screenshot_url: paymentScreenshotUrl ?? null,
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
      })
      .eq("id", existing.id)
      .eq("student_id", user.id)
      .select("id, status")
      .single();

    if (reopenError || !reopened) {
      return NextResponse.json({ error: "Could not resubmit enrollment" }, { status: 500 });
    }

    await notifyReceived();
    return NextResponse.json({ id: reopened.id, status: reopened.status });
  }

  const { data: created, error } = await supabase
    .from("enrollments")
    .insert({
      student_id: user.id,
      course_id: course.id,
      status: "pending",
      payment_amount_pkr: paymentAmountPkr,
      payment_screenshot_url: paymentScreenshotUrl,
    })
    .select("id, status")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "Could not create enrollment" }, { status: 500 });
  }

  await notifyReceived();
  return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
}
