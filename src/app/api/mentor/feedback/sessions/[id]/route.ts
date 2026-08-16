import { NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const admin = createAdminSupabase();
  const { data: mentor } = await admin.from("mentors").select("id").eq("profile_id", auth.user.id).maybeSingle();
  if (!mentor) return NextResponse.json({ error: "Not a mentor" }, { status: 403 });

  const detail = await getFeedbackSessionDetail(id);
  if (!detail || detail.session.mentorId !== mentor.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
