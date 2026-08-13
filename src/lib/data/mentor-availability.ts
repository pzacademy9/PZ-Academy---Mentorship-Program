import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { WeeklyRange } from "@/lib/data/session-slots";
import type { MentorAvailabilityInput } from "@/lib/validations/mentor-availability";

/**
 * Mirrors mentor-self.ts's split exactly: the read goes through the
 * service-role client (the caller is already gated by requireMentor() at
 * its own route boundary); the write goes through the caller's own session
 * client so update_own_mentor_availability's `where profile_id = auth.uid()`
 * resolves to the real caller.
 */

export interface OwnAvailability {
  timezone: string;
  weeklyRanges: WeeklyRange[];
}

export async function getOwnMentorAvailability(profileId: string): Promise<OwnAvailability | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mentors")
    .select("timezone, availability_json")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!data) return null;

  const raw = data.availability_json as { weeklyRanges?: WeeklyRange[] } | null;
  return {
    timezone: data.timezone ?? "",
    weeklyRanges: raw?.weeklyRanges ?? [],
  };
}

export type UpdateOwnAvailabilityResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" };

export async function updateOwnMentorAvailability(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  input: MentorAvailabilityInput,
): Promise<UpdateOwnAvailabilityResult> {
  const { data, error } = await supabase.rpc("update_own_mentor_availability", {
    p_timezone: input.timezone,
    p_weekly_ranges: input.weeklyRanges,
  });

  if (error) return { ok: false, reason: "db-error" };
  if (data !== true) return { ok: false, reason: "not-found" };
  return { ok: true };
}
