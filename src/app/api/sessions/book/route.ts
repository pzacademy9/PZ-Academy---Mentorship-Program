import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { bookSessionsSchema } from "@/lib/validations/mentorship-sessions";
import { bookMentorshipSessions } from "@/lib/data/mentorship-sessions";

/**
 * Public route, login-only (no role gate) — any authenticated student can
 * book sessions on their own confirmed bookings. Matches the inline
 * auth.getUser() pattern used by /api/notifications/read rather than a
 * dedicated requireStudent() helper, since no such helper exists in this
 * repo and the real security boundary is the RPC's own
 * `student_id = auth.uid()` check, not this route.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const parsed = bookSessionsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await bookMentorshipSessions(supabase, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created: result.created });
}
