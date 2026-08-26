import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export interface MentorReview {
  id: string;
  name: string;
  submittedAt: string;
  avgStars: number | null;
  comment: string;
  sessionName: string;
  isFeatured: boolean;
}

export interface MentorReviewSummary {
  avg: number | null;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Reads through the admin client, same as every other feedback-table access
 * — feedback_responses/feedback_answers carry zero RLS policies (0033), so
 * the anon client src/lib/data/mentors.ts uses cannot see them. Both
 * is_public and mentors.show_reviews are enforced HERE, not left to
 * callers, so no consumer can accidentally render a hidden review or a
 * mentor who's turned the whole section off.
 */
async function reviewsEnabledFor(mentorId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("mentors").select("show_reviews").eq("id", mentorId).maybeSingle();
  return data?.show_reviews ?? false;
}

const EMPTY_SUMMARY: MentorReviewSummary = { avg: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };

function summaryFromRow(row: {
  response_count: number;
  avg_star: number | null;
  star_1: number;
  star_2: number;
  star_3: number;
  star_4: number;
  star_5: number;
}): MentorReviewSummary {
  return {
    avg: row.avg_star,
    count: row.response_count,
    distribution: { 1: row.star_1, 2: row.star_2, 3: row.star_3, 4: row.star_4, 5: row.star_5 },
  };
}

/**
 * Aggregated in Postgres via mentor_review_stats (migration 0046), not by
 * fetching every feedback_responses/feedback_answers row into JS and
 * reducing here — PostgREST's db-max-rows cap (~1000) silently truncated
 * that fetch-all approach for mentors with a lot of history, producing a
 * wrong average/distribution with no error. Same fix shape as
 * feedback_session_stats (0034) and mentor_tier_inputs (0045).
 */
export async function getMentorReviewSummary(mentorId: string): Promise<MentorReviewSummary> {
  if (!(await reviewsEnabledFor(mentorId))) return EMPTY_SUMMARY;

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("mentor_review_stats", { p_mentor_ids: [mentorId] });
  if (error || !data?.length) return EMPTY_SUMMARY;

  return summaryFromRow(data[0]);
}

/**
 * Batch variant of getMentorReviewSummary for list views (the /mentorship
 * grid) — one mentor_review_stats call instead of N. Mentors with
 * show_reviews off, or with no public commented responses, come back with
 * the same EMPTY_SUMMARY getMentorReviewSummary would give them (never
 * omitted from the returned map).
 */
export async function getMentorReviewSummaries(mentorIds: string[]): Promise<Record<string, MentorReviewSummary>> {
  const result: Record<string, MentorReviewSummary> = {};
  for (const id of mentorIds) result[id] = EMPTY_SUMMARY;
  if (!mentorIds.length) return result;

  const admin = createAdminSupabase();
  const { data: mentorRows } = await admin.from("mentors").select("id, show_reviews").in("id", mentorIds);
  const enabledIds = (mentorRows ?? []).filter((m) => m.show_reviews).map((m) => m.id);
  if (!enabledIds.length) return result;

  const { data, error } = await admin.rpc("mentor_review_stats", { p_mentor_ids: enabledIds });
  if (error || !data) return result;

  for (const row of data) result[row.mentor_id] = summaryFromRow(row);
  return result;
}

export async function listMentorReviews(mentorId: string, opts: { limit?: number } = {}): Promise<MentorReview[]> {
  if (!(await reviewsEnabledFor(mentorId))) return [];

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select(
      "id, participant_name, submitted_at, comments, is_featured, feedback_answers(star_value), feedback_sessions!inner(mentor_id, name)",
    )
    .eq("feedback_sessions.mentor_id", mentorId)
    .eq("is_public", true)
    .order("submitted_at", { ascending: false })
    .limit(opts.limit ?? 50);

  return (data ?? [])
    .filter((r) => r.comments?.trim())
    .map((r) => {
      const stars = (r.feedback_answers ?? []).map((a) => a.star_value).filter((v): v is number => v != null);
      const avgStars = stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null;
      return {
        id: r.id,
        name: r.participant_name || "Anonymous",
        submittedAt: r.submitted_at,
        avgStars,
        comment: r.comments,
        sessionName: (r.feedback_sessions as unknown as { name: string }).name,
        isFeatured: r.is_featured,
      };
    });
}
