import { NextRequest, NextResponse } from "next/server";
import { requireMentor } from "@/lib/auth/require-mentor";
import { mentorSelfEditSchema } from "@/lib/validations/mentor-self";
import { updateOwnMentorProfile } from "@/lib/data/mentor-self";

/**
 * Saves the mentor's own profile edit form. Whitelisted columns only — see
 * mentorSelfEditSchema and migration 0029's update_own_mentor_profile.
 * The RPC does a full replace of those columns on every call (not a
 * partial merge) — a whitelisted field omitted from the request body is
 * written as null/[], not left as-is. Callers must send the complete set.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireMentor();
  if (!auth.ok) return auth.response;

  const parsed = mentorSelfEditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await updateOwnMentorProfile(auth.supabase, parsed.data);
  if (!result.ok) {
    if (result.reason === "not-found") {
      return NextResponse.json({ error: "No mentor profile is linked to your account." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
