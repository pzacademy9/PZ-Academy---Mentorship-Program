import { NextRequest, NextResponse } from "next/server";
import { mentorshipBookingSchema } from "@/lib/validations/mentorship-booking";
import { findStudentIdByEmail } from "@/lib/data/sheet-sync";
import { insertBooking } from "@/lib/data/mentorship-bookings";
import { sendMentorshipEmail } from "@/lib/emails/mentorship";

const GAS_URL = process.env.GAS_WEBAPP_URL ?? "";
const GAS_SHARED_SECRET = process.env.GAS_SHARED_SECRET ?? "";
const BOOKING_SCRIPT_URL = process.env.NEXT_PUBLIC_BOOKING_SCRIPT_URL ?? "";

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

  const { id } = await insertBooking({
    studentId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    mentorSlug: input.mentorSlug,
    mentorName: input.mentorName,
    packageName: input.packageName,
    goals: input.goals ?? null,
    paymentScreenshotUrl: screenshotUrl,
  });

  if (BOOKING_SCRIPT_URL) {
    try {
      await fetch(BOOKING_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify({
          name: input.fullName,
          email: input.email,
          phone: input.phone,
          mentorName: input.mentorName,
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

  await sendMentorshipEmail("bookingReceived", input.email, { fullName: input.fullName, mentorName: input.mentorName });

  return NextResponse.json({ ok: true, id });
}
