import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { applyEnrollmentStatus, getEnrollmentForReview } from "@/lib/data/admin-enrollments";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { pushStatusToSheet } from "@/lib/gas/sheets-sync-client";

const bodySchema = z.object({ decision: z.enum(["confirm", "dismiss"]) });

/**
 * Resolves a sheet-requested downgrade parked on sheet_pending_status.
 *
 * confirm: applies the requested status for real, through the same
 * applyEnrollmentStatus() every other transition in this codebase uses.
 * dismiss: clears the parked fields without changing status, then pushes
 * the enrollment's UNCHANGED current status back to the sheet — correcting
 * the stray cell rather than leaving it visibly wrong.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const enrollment = await getEnrollmentForReview(id);
  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }
  if (!enrollment.sheetPendingStatus) {
    return NextResponse.json({ error: "No pending sheet request on this enrollment" }, { status: 409 });
  }

  if (parsed.data.decision === "dismiss") {
    const admin = createAdminSupabase();
    const { error } = await admin
      .from("enrollments")
      .update({ sheet_pending_status: null, sheet_pending_note: null })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Could not dismiss the sheet request" }, { status: 500 });
    }

    if (enrollment.course.sheetId && enrollment.student.email) {
      await pushStatusToSheet({
        sheetId: enrollment.course.sheetId,
        email: enrollment.student.email,
        status: enrollment.status,
      });
    }
    return NextResponse.json({ id, status: enrollment.status });
  }

  const result = await applyEnrollmentStatus({
    enrollmentId: id,
    targetStatus: enrollment.sheetPendingStatus,
    verifiedBy: auth.user.id,
    clearShortfall: true,
    emailKind: null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Could not apply the sheet-requested status" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id, status: result.status });
}
