import { NextRequest, NextResponse } from "next/server";
import { mentorshipBookingSchema } from "@/lib/validations/mentorship-booking";
import { findStudentIdByEmail } from "@/lib/data/sheet-sync";
import { insertBooking } from "@/lib/data/mentorship-bookings";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getBookableMentor } from "@/lib/data/mentors";
import { isKnownPackageName } from "@/lib/validations/admin-mentor";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";
const BOOKING_SCRIPT_URL = process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL ?? "";

// Screenshot upload + GAS forward can take a while on a slow connection.
export const maxDuration = 60;

/**
 * Public — no auth, matching the booking form's own public nature (same
 * reasoning as /api/upload-video). Inserts into Supabase, uploads the
 * screenshot via the shared GAS dispatcher, then forwards the original
 * payload to the team's existing Sheet exactly as before this feature.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = mentorshipBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const input = parsed.data;

  // The registry now exists (supabase/migrations/0028_mentor_registry.sql) —
  // mentorSlug/mentorName/packageName were previously trusted verbatim from
  // the client and written straight into the DB, the admin review screen,
  // the confirmation email, and the team's Sheet. Validate against it before
  // any of that: mentor.name (DB-sourced) replaces input.mentorName below,
  // so a spoofed mentorName in the request body never reaches any of those
  // four surfaces.
  const mentor = await getBookableMentor(input.mentorSlug);
  if (!mentor) {
    return NextResponse.json({ error: "That mentor is not available for booking right now." }, { status: 400 });
  }
  if (!isKnownPackageName(mentor.packages, input.packageName)) {
    return NextResponse.json({ error: "That package is no longer offered." }, { status: 400 });
  }

  // Rate limit: the Supabase table itself is the store (no shared
  // in-memory state across serverless invocations, and no existing
  // Redis/Upstash dependency to add one for).
  const admin = createAdminSupabase();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentCount } = await admin
    .from("mentorship_bookings")
    .select("id", { count: "exact", head: true })
    .eq("email", input.email)
    .gte("created_at", tenMinutesAgo);
  if ((recentCount ?? 0) >= 3) {
    return NextResponse.json(
      { error: "Too many submissions. Please wait a few minutes and try again, or contact us on WhatsApp." },
      { status: 429 },
    );
  }

  let screenshotUrl: string | null = null;
  if (input.screenshotBase64 && GAS_URL) {
    try {
      const gasRes = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "uploadMentorshipFile",
          secret: GAS_SHARED_SECRET,
          folder: "Bookings",
          mimeType: input.screenshotMimeType,
          base64: input.screenshotBase64,
          filename: input.screenshotName,
        }),
      });
      const json: { ok: boolean; url?: string } = await gasRes.json();
      if (json.ok && json.url) screenshotUrl = json.url;
    } catch (error) {
      console.error("[mentorship-bookings] screenshot upload failed:", error);
    }
  }

  const studentId = await findStudentIdByEmail(input.email);

  // The Sheet is still the team's operational system of record — a
  // Supabase insert failure must not skip the GAS forward below, so it's
  // never lost from both systems at once.
  let id: string | null = null;
  try {
    id = (
      await insertBooking({
        studentId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        mentorSlug: input.mentorSlug,
        mentorName: mentor.name,
        packageName: input.packageName,
        goals: input.goals ?? null,
        paymentScreenshotUrl: screenshotUrl,
      })
    ).id;
  } catch (error) {
    console.error("[mentorship-bookings] Supabase insert failed:", error);
  }

  if (BOOKING_SCRIPT_URL) {
    try {
      await fetch(BOOKING_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          name: input.fullName,
          email: input.email,
          phone: input.phone,
          mentorName: mentor.name,
          packageName: input.packageName,
          goals: input.goals ?? "",
          paymentRef: input.screenshotName ?? "",
          screenshotBase64: input.screenshotBase64 ?? "",
          screenshotName: input.screenshotName ?? "",
        }),
      });
    } catch (error) {
      // Soft-fail: the Supabase row already exists, so the booking is not
      // lost even if the team's Sheet doesn't get this row.
      console.error("[mentorship-bookings] GAS forward failed:", error);
    }
  }

  await sendMentorshipEmail("bookingReceived", input.email, { fullName: input.fullName, mentorName: mentor.name });

  return NextResponse.json({ ok: true, id });
}
