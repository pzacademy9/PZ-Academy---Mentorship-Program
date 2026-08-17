import { NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listFeedbackSessionsForMentor } from "@/lib/data/feedback-sessions";

export async function GET() {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabase();
  const { data: mentor } = await admin.from("mentors").select("id").eq("profile_id", auth.user.id).maybeSingle();
  if (!mentor) return NextResponse.json({ sessions: [] });

  return NextResponse.json({ sessions: await listFeedbackSessionsForMentor(mentor.id) });
}
