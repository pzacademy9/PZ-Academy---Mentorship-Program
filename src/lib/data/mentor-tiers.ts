import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { computeMentorTier } from "@/lib/mentor-tier";

/**
 * House rule, stated in feedback-mentorship-sync.ts: "anything a later UI
 * needs to read must be written at the state-transition commit point." Every
 * tier input changes at exactly the commit points wired up in
 * mentorship-sessions.ts / feedback-responses.ts / admin-mentors.ts.
 *
 * NEVER THROWS. A tier is decoration; a session completion and a feedback
 * submission are not. Every failure path here is caught and console.error'd,
 * exactly like freezeMentorshipFeedbackSession / notifyMentorOfFeedback.
 *
 * AWAITED, not fire-and-forget: a floating promise in a Next.js serverless
 * function can be killed the moment the response is flushed, so a
 * fire-and-forget recompute would silently never run in production. Awaiting
 * a never-throwing function costs one round trip and is always safe.
 */
export async function recomputeMentorTiers(mentorIds: string[]): Promise<void> {
  const ids = Array.from(new Set(mentorIds.filter(Boolean)));
  if (!ids.length) return;
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.rpc("mentor_tier_inputs", { p_mentor_ids: ids });
    if (error || !data) throw new Error(error?.message ?? "mentor_tier_inputs returned no rows");

    await Promise.all(
      data.map((row) => {
        const { tier, score } = computeMentorTier({
          ratingAvg: row.rating_avg,
          reviewCount: row.review_count,
          sessionCount: row.session_count,
        });
        return admin
          .from("mentors")
          .update({
            tier_computed: tier,
            tier_score: score,
            tier_rating_avg: row.rating_avg,
            tier_review_count: row.review_count,
            tier_session_count: row.session_count,
            tier_computed_at: new Date().toISOString(),
          })
          .eq("id", row.mentor_id);
      }),
    );
  } catch (error) {
    console.error(`[mentor-tiers] recompute failed for ${ids.join(", ")}:`, error);
  }
}

/**
 * mentorship_session_id -> mentors.id, via the profile_id hop (sessions.mentor_id
 * references profiles, not mentors). No-ops for account-less mentors.
 */
export async function recomputeTierForMentorshipSession(sessionId: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data: s } = await admin.from("sessions").select("mentor_id").eq("id", sessionId).maybeSingle();
    if (!s?.mentor_id) return;
    const { data: m } = await admin.from("mentors").select("id").eq("profile_id", s.mentor_id).maybeSingle();
    if (!m) return;
    await recomputeMentorTiers([m.id]);
  } catch (error) {
    console.error(`[mentor-tiers] session->mentor resolve failed for ${sessionId}:`, error);
  }
}

/** feedback_sessions.mentor_id IS mentors.id (0033) — direct, no hop. */
export async function recomputeTierForFeedbackSession(feedbackSessionId: string): Promise<void> {
  try {
    const admin = createAdminSupabase();
    const { data } = await admin.from("feedback_sessions").select("mentor_id").eq("id", feedbackSessionId).maybeSingle();
    if (!data?.mentor_id) return;
    await recomputeMentorTiers([data.mentor_id]);
  } catch (error) {
    console.error(`[mentor-tiers] feedback-session->mentor resolve failed for ${feedbackSessionId}:`, error);
  }
}

export async function recomputeAllMentorTiers(): Promise<{ updated: number }> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select("id");
  const ids = (data ?? []).map((m) => m.id);
  await recomputeMentorTiers(ids);
  return { updated: ids.length };
}
