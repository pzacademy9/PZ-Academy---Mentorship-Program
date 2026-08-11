import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { mapMentorRow, MENTOR_SELECT, type Mentor } from "@/lib/data/mentors";
import type { MentorSelfEditInput } from "@/lib/validations/mentor-self";

/**
 * Mentor-facing self-service data layer (subsystem B). The read goes
 * through the service-role client — the caller is already gated by
 * requireMentor()/requireMentorPage() at its own route boundary, same
 * convention as admin-mentors.ts. The write does NOT: it must go through
 * the caller's own session client so update_own_mentor_profile's
 * `where profile_id = auth.uid()` resolves to the real caller, not the
 * service role (which has no matching auth.uid()).
 */

export async function getOwnMentorProfile(profileId: string): Promise<Mentor | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select(MENTOR_SELECT).eq("profile_id", profileId).maybeSingle();
  if (!data) return null;
  return mapMentorRow(data);
}

export type UpdateOwnProfileResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function updateOwnMentorProfile(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: MentorSelfEditInput,
): Promise<UpdateOwnProfileResult> {
  const { data, error } = await supabase.rpc("update_own_mentor_profile", {
    p_short_bio: input.shortBio ?? null,
    p_full_bio: input.fullBio ?? [],
    p_photo_url: input.photoUrl ?? null,
    p_availability_text: input.availabilityText ?? null,
    p_intro_video_url: input.introVideoUrl ?? null,
    p_linkedin_url: input.linkedinUrl ?? null,
    p_social_links: input.socialLinks ?? [],
    p_skills: input.skills ?? [],
    p_credentials: input.credentials ?? [],
    p_timezone: input.timezone ?? null,
    p_session_duration_text: input.sessionDurationText ?? null,
  });

  if (error) return { ok: false, reason: "db-error" };
  if (data !== true) return { ok: false, reason: "not-found" };
  return { ok: true };
}
