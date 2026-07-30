// src/app/api/webhooks/sheets-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { sheetSyncWebhookSchema, mapSheetRow, isDowngrade } from "@/lib/validations/sheet-sync";
import {
  getCourseBySheetId,
  findStudentIdByEmail,
  insertSheetLead,
  notifyAdminsOfSheetDowngrade,
} from "@/lib/data/sheet-sync";
import { applyEnrollmentStatus } from "@/lib/data/admin-enrollments";
import { sendEnrollmentEmail } from "@/lib/emails/enrollment";
import { pushStatusToSheet } from "@/lib/gas/sheets-sync-client";

/**
 * Receives new-submission and status-change events from gas/sheets-sync/Code.gs.
 *
 * Token check happens before any DB access, mirroring the ordering already
 * used by gas/payment-screenshots/Code.gs's inbound counterpart — an
 * unauthenticated caller must never cause a read or write.
 */
export async function POST(req: NextRequest) {
  try {
    return await handlePost(req);
  } catch (err) {
    return NextResponse.json({ status: "error", message: String(err) });
  }
}

async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !process.env.SHEETS_SYNC_SECRET || body.token !== process.env.SHEETS_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  const parsed = sheetSyncWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }
  const { sheetId, row } = parsed.data;

  const course = await getCourseBySheetId(sheetId);
  if (!course) {
    return NextResponse.json({ status: "error", message: `No course maps to sheet ${sheetId}` });
  }

  const mapped = mapSheetRow({ paymentConfirmation: row.paymentConfirmation, amountPkr: row.amountPkr ?? null });
  const studentId = await findStudentIdByEmail(row.email);

  if (!studentId) {
    // No account yet — stage the row and invite them to sign up. This is the
    // only path for a genuinely new lead; existing enrollments always have a
    // matching account already, since the direct-enrollment pipeline
    // requires being signed in.
    await insertSheetLead({
      sheetId,
      courseId: course.id,
      email: row.email,
      name: row.name ?? null,
      phone: row.phone ?? null,
      paymentConfirmation: row.paymentConfirmation,
      amountPkr: row.amountPkr ?? null,
      rawRow: row,
    });
    await sendEnrollmentEmail("leadWelcome", row.email, {
      fullName: row.name ?? "",
      courseTitle: course.title,
      courseSlug: course.slug,
    });
    return NextResponse.json({ status: "success", message: "Staged as a lead" });
  }

  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("enrollments")
    .select("id, status, sheet_pending_status")
    .eq("student_id", studentId)
    .eq("course_id", course.id)
    .maybeSingle();

  if (!existing) {
    // Brand-new (student, course) pair — insert directly. There is no prior
    // status to compare against, so the downgrade rule doesn't apply here.
    const { data: created, error } = await admin
      .from("enrollments")
      .insert({
        student_id: studentId,
        course_id: course.id,
        status: mapped.status,
        payment_amount_pkr: mapped.paymentAmountPkr,
        payment_shortfall_pkr: mapped.shortfallPkr,
        verified_at: mapped.status !== "pending" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error || !created) {
      return NextResponse.json({ status: "error", message: "Could not create enrollment" });
    }

    const emailKind =
      mapped.status === "active" ? "approved" : mapped.status === "reserved" ? "reserved" : null;
    if (emailKind) {
      await sendEnrollmentEmail(emailKind, row.email, {
        fullName: row.name ?? "",
        courseTitle: course.title,
        courseSlug: course.slug,
      });
    } else if (mapped.shortfallPkr != null) {
      await sendEnrollmentEmail("shortfall", row.email, {
        fullName: row.name ?? "",
        courseTitle: course.title,
        courseSlug: course.slug,
        shortfallPkr: mapped.shortfallPkr,
      });
    }

    await pushStatusToSheet({ email: row.email, status: mapped.status, shortfallPkr: mapped.shortfallPkr });
    return NextResponse.json({ status: "success", message: "Enrollment created" });
  }

  // An enrollment already exists for this (student, course) pair — this is
  // effectively a status-change event regardless of which `action` GAS sent,
  // so the same downgrade rule always applies.
  if (isDowngrade(existing.status, mapped.status)) {
    // Captured before the update below overwrites it — this is the only way
    // to know whether this exact downgrade was already parked, so admins
    // aren't re-notified for the same pending request on every sheet poll.
    const alreadyRequested = existing.sheet_pending_status === mapped.status;

    await admin
      .from("enrollments")
      .update({
        sheet_pending_status: mapped.status,
        sheet_pending_note: `Sheet requested: ${existing.status} → ${mapped.status}`,
      })
      .eq("id", existing.id);

    if (!alreadyRequested) {
      await notifyAdminsOfSheetDowngrade({
        enrollmentId: existing.id,
        studentName: row.name || row.email,
        courseTitle: course.title,
        from: existing.status,
        to: mapped.status,
      });
    }
    return NextResponse.json({ status: "success", message: "Downgrade parked for admin confirmation" });
  }

  const emailKind =
    mapped.status === "active" ? "approved" : mapped.status === "reserved" ? "reserved" : null;

  const result = await applyEnrollmentStatus({
    enrollmentId: existing.id,
    targetStatus: mapped.status,
    verifiedBy: null,
    clearShortfall: mapped.shortfallPkr == null,
    emailKind,
  });

  // "already-in-status" still needs to fall through to the shortfall block
  // below: an Underpaid row on an already-pending enrollment hits this guard
  // inside applyEnrollmentStatus every time (mapSheetRow maps Underpaid to
  // "pending", same as the existing status), but the shortfall amount itself
  // can still have changed and must still be persisted and emailed.
  if (!result.ok && result.reason !== "already-in-status") {
    return NextResponse.json({ status: "success", message: `No change (${result.reason})` });
  }

  if (mapped.shortfallPkr != null) {
    await admin
      .from("enrollments")
      .update({ payment_shortfall_pkr: mapped.shortfallPkr })
      .eq("id", existing.id);
    await sendEnrollmentEmail("shortfall", row.email, {
      fullName: row.name ?? "",
      courseTitle: course.title,
      courseSlug: course.slug,
      shortfallPkr: mapped.shortfallPkr,
    });
    await pushStatusToSheet({ email: row.email, status: mapped.status, shortfallPkr: mapped.shortfallPkr });
  }

  return NextResponse.json({ status: "success", message: "Enrollment updated" });
}
