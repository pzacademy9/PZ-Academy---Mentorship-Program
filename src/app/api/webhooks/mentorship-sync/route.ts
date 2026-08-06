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
 * Unlike the course-enrollment Sheets (where "newSubmission" is a genuinely
 * distinct event fed by a separate WordPress form), the mentorship Sheets'
 * Status column starts out empty for every row and is only ever populated
 * by a human typing a value into it. gas/mentorship-sync/Code.gs's onEdit
 * classifies a row as "newSubmission" until its SyncedAt tracking column is
 * stamped — which only happens the first time onEdit fires for that row —
 * so the very first status a human enters gets labelled "newSubmission" and
 * every edit after that gets labelled "statusChange". Since onEdit already
 * guards against firing on an empty Status value, both action values here
 * represent the same thing: a real status a human just entered. So both
 * flow through the same status-update logic below — there is no "new row,
 * nothing to do yet" case to no-op on.
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
  const { sheetKind, row } = parsed.data;

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
