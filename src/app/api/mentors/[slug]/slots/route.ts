import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeAvailableSlots } from "@/lib/data/session-slots";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminSupabase();

  const { data: mentor } = await admin
    .from("mentors")
    .select("id, profile_id, timezone, session_duration_minutes, lead_time_hours, availability_json")
    .eq("slug", slug)
    .eq("visibility", "published")
    .maybeSingle();

  if (!mentor || !mentor.profile_id) {
    return NextResponse.json({ error: "Mentor not available for scheduling" }, { status: 404 });
  }

  const { data: booked } = await admin
    .from("sessions")
    .select("scheduled_at")
    .eq("mentor_id", mentor.profile_id)
    .not("status", "eq", "cancelled")
    .not("scheduled_at", "is", null)
    // Past sessions can never collide with a future-only slot search, and
    // without a lower bound this query has no limit — it would eventually
    // hit PostgREST's default 1000-row cap in an undefined row order,
    // potentially truncating future booked slots out of the exclusion list.
    .gte("scheduled_at", new Date().toISOString());

  const availability = (mentor.availability_json as { weeklyRanges?: { day: number; start: string; end: string }[] } | null) ?? {
    weeklyRanges: [],
  };

  const slots = computeAvailableSlots({
    availability: { weeklyRanges: availability.weeklyRanges ?? [] },
    timezone: mentor.timezone ?? "UTC",
    durationMinutes: mentor.session_duration_minutes,
    leadTimeHours: mentor.lead_time_hours,
    bookedSlots: (booked ?? []).map((b) => b.scheduled_at as string),
    now: new Date(),
    daysAhead: 30,
  });

  return NextResponse.json({ slots, timezone: mentor.timezone ?? "UTC" });
}
