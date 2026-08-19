import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { updateMentorNotesSchema } from "@/lib/validations/mentorship-sessions";
import { updateSessionMentorNotes } from "@/lib/data/mentorship-sessions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const parsed = updateMentorNotesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Deliberately scoped to the owning mentor only, unlike the sibling
  // status route -- these are private per-mentor notes, so even an admin
  // caller (permitted by requireMentor()) gets a 404 rather than being
  // able to write another mentor's notes.
  const result = await updateSessionMentorNotes(id, auth.user.id, parsed.data.notes);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "not-found" ? "Session not found" : "Could not save notes" }, {
      status: result.reason === "not-found" ? 404 : 500,
    });
  }

  return NextResponse.json({ ok: true });
}
