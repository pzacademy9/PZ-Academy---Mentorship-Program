import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { mentorAvailabilitySchema } from "@/lib/validations/mentor-availability";
import { updateOwnMentorAvailability } from "@/lib/data/mentor-availability";

/**
 * Saves the mentor's own weekly availability pattern. Full replace, not a
 * merge — see update_own_mentor_availability in migration 0031. A caller
 * that omits weeklyRanges from the payload turns availability off entirely,
 * it does not leave the existing pattern untouched.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const parsed = mentorAvailabilitySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateOwnMentorAvailability(auth.supabase, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "No mentor profile is linked to your account." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not save availability" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
