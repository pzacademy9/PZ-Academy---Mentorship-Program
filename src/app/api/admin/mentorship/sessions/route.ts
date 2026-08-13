import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { scheduleSessionSchema } from "@/lib/validations/mentorship-sessions";
import { createSessionForBooking } from "@/lib/data/mentorship-sessions";

const REASON_MESSAGES: Record<string, string> = {
  "booking-not-found": "Booking not found.",
  "not-confirmed": "This booking isn't confirmed yet.",
  "mentor-not-linked": "This mentor has no linked account yet — link one from the mentor's edit page first.",
  "student-not-linked": "This booking has no matched student account.",
  "already-scheduled": "This booking already has sessions scheduled.",
  "db-error": "Could not schedule this session.",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = scheduleSessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await createSessionForBooking({
    bookingId: parsed.data.bookingId,
    scheduledAt: parsed.data.scheduledAt,
  });

  if (!result.ok) {
    const status = result.reason === "booking-not-found" ? 404 : result.reason === "db-error" ? 500 : 400;
    return NextResponse.json({ error: REASON_MESSAGES[result.reason] }, { status });
  }

  return NextResponse.json({ ok: true, sessionsTotal: result.sessionsTotal, created: result.created });
}
