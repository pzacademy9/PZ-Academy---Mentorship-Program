import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { sessionStatusUpdateSchema } from "@/lib/validations/mentorship-sessions";
import { setSessionStatus } from "@/lib/data/mentorship-sessions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = sessionStatusUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Determine if caller is a plain mentor (restrict to own sessions) or admin/super_admin (access all)
  const { data: profile } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  const scopeToMentorId = profile?.role === "mentor" ? auth.user.id : undefined;

  const result = await setSessionStatus(id, parsed.data.status, scopeToMentorId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "not-found" ? "Session not found" : "Could not update session" }, {
      status: result.reason === "not-found" ? 404 : 500,
    });
  }

  return NextResponse.json({ ok: true });
}
