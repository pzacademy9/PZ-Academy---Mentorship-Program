import { NextRequest, NextResponse } from "next/server";
import {
  mentorshipSyncWebhookSchema,
  mapBookingSheetStatus,
  mapApplicationSheetStatus,
} from "@/lib/validations/mentorship-sync";
import { applyBookingStatus } from "@/lib/data/mentorship-bookings";
import { applyApplicationStatus } from "@/lib/data/mentorship-applications";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Receives status-change events from gas/mentorship-sync/Code.gs.
 *
 * "newSubmission" is a no-op here: unlike the course-enrollment Sheets (fed
 * directly by a separate WordPress form), the mentorship Sheets are only
 * ever written to by this platform's own write-path routes
 * (/api/mentorship/bookings, /api/mentorship/applications), which already
 * insert the Supabase row before forwarding to GAS — so by the time GAS's
 * onEdit fires for a brand-new row, the row already exists. Only a later
 * hand-edit to the Status column ("statusChange") needs this webhook to do
 * anything.
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

  if (!body || !process.env.MENTORSHIP_SYNC_SECRET || body.secret !== process.env.MENTORSHIP_SYNC_SECRET) {
    return NextResponse.json({ status: "error", message: "Wrong password." });
  }

  const parsed = mentorshipSyncWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid input" });
  }
  const { action, sheetKind, row } = parsed.data;

  if (action === "newSubmission") {
    return NextResponse.json({ status: "success", message: "Acknowledged" });
  }

  const admin = createAdminSupabase();

  if (sheetKind === "booking") {
    const status = mapBookingSheetStatus(row.status);
    if (!status) {
      return NextResponse.json({ status: "error", message: `Unknown booking status: ${row.status}` });
    }
    const { data: existing } = await admin
      .from("mentorship_bookings")
      .select("id")
      .eq("email", row.email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ status: "error", message: `No booking found for ${row.email}` });
    }
    const result = await applyBookingStatus({
      bookingId: existing.id,
      targetStatus: status,
      emailKind: status === "confirmed" ? "bookingConfirmed" : status === "cancelled" ? "bookingCancelled" : null,
    });
    if (!result.ok && result.reason !== "already-in-status") {
      return NextResponse.json({ status: "success", message: `No change (${result.reason})` });
    }
    return NextResponse.json({ status: "success", message: "Booking updated" });
  }

  const status = mapApplicationSheetStatus(row.status);
  if (!status) {
    return NextResponse.json({ status: "error", message: `Unknown application status: ${row.status}` });
  }
  const { data: existing } = await admin
    .from("mentor_applications")
    .select("id")
    .eq("email", row.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ status: "error", message: `No application found for ${row.email}` });
  }
  const result = await applyApplicationStatus({
    applicationId: existing.id,
    targetStatus: status,
    emailKind: status === "approved" ? "applicationApproved" : status === "rejected" ? "applicationRejected" : null,
  });
  if (!result.ok && result.reason !== "already-in-status") {
    return NextResponse.json({ status: "success", message: `No change (${result.reason})` });
  }
  return NextResponse.json({ status: "success", message: "Application updated" });
}
