import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getMyEnrollments } from "@/lib/data/enrollments";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const enrollments = await getMyEnrollments(user.id);
  return NextResponse.json({ enrollments });
}
