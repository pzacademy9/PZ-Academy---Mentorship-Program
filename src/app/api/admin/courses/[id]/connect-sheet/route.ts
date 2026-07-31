import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { registerSheet } from "@/lib/gas/sheets-sync-client";

const bodySchema = z.object({
  sheetId: z.string().trim().min(10, "That doesn't look like a Google Sheets ID"),
});

/**
 * Connects a course to a Google Sheet for Phase 0 sync: saves courses.sheet_id
 * and asks the single shared GAS deployment to start watching that sheet.
 *
 * The RLS policy on courses ("courses: super_admin write") only allows
 * super_admin, but requireAdmin() also allows plain admin — so this goes
 * through the service-role client with an explicit column whitelist (only
 * sheet_id), the same pattern every other admin write route in this
 * codebase uses rather than widening the RLS policy itself.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { sheetId } = parsed.data;

  const admin = createAdminSupabase();
  const { data: course, error } = await admin
    .from("courses")
    .update({ sheet_id: sheetId })
    .eq("id", id)
    .select("id, title")
    .single();

  if (error) {
    // 23505 = unique_violation. courses.sheet_id is unique (0019) precisely
    // so a copy-paste mistake here can't silently double-connect a sheet to
    // two courses — surface it instead of a generic failure.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That sheet is already connected to a different course." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not connect this sheet" }, { status: 500 });
  }
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const registration = await registerSheet(sheetId);
  if (!registration.ok) {
    // The course/sheet link is saved either way — the sheet just isn't being
    // watched yet. Surface this clearly so the admin knows to retry rather
    // than assume live sync is already working.
    return NextResponse.json(
      {
        id: course.id,
        sheetId,
        registered: false,
        warning: `Saved, but couldn't confirm the sheet is being watched: ${registration.message}`,
      },
      { status: 207 },
    );
  }

  return NextResponse.json({ id: course.id, sheetId, registered: true });
}
