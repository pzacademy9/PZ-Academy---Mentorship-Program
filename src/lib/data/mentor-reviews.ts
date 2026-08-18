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
 * Pure aggregation math, pulled out of getMentorReviewSummary so it can be
 * unit-tested directly without touching a DB — this repo's convention
 * (average()/clampStar() in validations/feedback.ts) is pure-function tests
 * only, never DB mocking.
 *
 * `perResponseStarLists` is one entry per feedback_responses row already
 * filtered to "public + has a non-empty comment" — each entry is that row's
 * own star values (a response can answer more than one stars-type
 * question). `count` reflects every entry in this list (i.e. every public
 * commented response), matching listMentorReviews's inclusion rule exactly
 * — a response that answered zero stars questions (e.g. an all-video
 * question bank, or a respondent who skipped the star questions) still
 * counts as a review, it just contributes nothing to the star distribution
 * or the average, since there's nothing to average.
 */
export function summarizeStarValues(perResponseStarLists: number[][]): MentorReviewSummary {
  const perResponseAvgs: number[] = [];
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;

  for (const stars of perResponseStarLists) {
    if (!stars.length) continue;
    const avg = stars.reduce((a, b) => a + b, 0) / stars.length;
    perResponseAvgs.push(avg);
    const rounded = Math.min(5, Math.max(1, Math.round(avg))) as 1 | 2 | 3 | 4 | 5;
    distribution[rounded] += 1;
  }

  const avg = perResponseAvgs.length
    ? Math.round((perResponseAvgs.reduce((a, b) => a + b, 0) / perResponseAvgs.length) * 10) / 10
    : null;

  return { avg, count: perResponseStarLists.length, distribution };
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

/** Confirmed live against the real Supabase project (whqdasotjlhvrjmgiffk): `feedback_sessions!inner(mentor_id)` + `.eq("feedback_sessions.mentor_id", ...)` correctly filters feedback_responses by its joined session's mentor. */
export async function getMentorReviewSummary(mentorId: string): Promise<MentorReviewSummary> {
  const empty: MentorReviewSummary = { avg: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  if (!(await reviewsEnabledFor(mentorId))) return empty;

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select("id, comments, feedback_sessions!inner(mentor_id), feedback_answers(star_value)")
    .eq("feedback_sessions.mentor_id", mentorId)
    .eq("is_public", true);

  const perResponseStarLists = (data ?? [])
    .filter((r) => r.comments?.trim())
    .map((r) => (r.feedback_answers ?? []).map((a) => a.star_value).filter((v): v is number => v != null));

  return summarizeStarValues(perResponseStarLists);
}

/**
 * Batch variant of getMentorReviewSummary for list views (the /mentorship
 * grid) — 2 queries total instead of N, reusing the same reviewsEnabledFor
 * + summarizeStarValues logic per mentor rather than N+1-querying per
 * MentorCard. Mentors with show_reviews off, or with no public commented
 * responses, come back with the same `empty` summary getMentorReviewSummary
 * would give them (never omitted from the returned map).
 */
export async function getMentorReviewSummaries(mentorIds: string[]): Promise<Record<string, MentorReviewSummary>> {
  const empty: MentorReviewSummary = { avg: null, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  const result: Record<string, MentorReviewSummary> = {};
  for (const id of mentorIds) result[id] = empty;
  if (!mentorIds.length) return result;

  const admin = createAdminSupabase();
  const { data: mentorRows } = await admin.from("mentors").select("id, show_reviews").in("id", mentorIds);
  const enabledIds = (mentorRows ?? []).filter((m) => m.show_reviews).map((m) => m.id);
  if (!enabledIds.length) return result;

  const { data } = await admin
    .from("feedback_responses")
    .select("id, comments, feedback_sessions!inner(mentor_id), feedback_answers(star_value)")
    .in("feedback_sessions.mentor_id", enabledIds)
    .eq("is_public", true);

  const perMentorStarLists = new Map<string, number[][]>();
  for (const id of enabledIds) perMentorStarLists.set(id, []);

  for (const r of data ?? []) {
    if (!r.comments?.trim()) continue;
    const mentorId = (r.feedback_sessions as unknown as { mentor_id: string }).mentor_id;
    const stars = (r.feedback_answers ?? []).map((a) => a.star_value).filter((v): v is number => v != null);
    perMentorStarLists.get(mentorId)?.push(stars);
  }

  perMentorStarLists.forEach((lists, id) => {
    result[id] = summarizeStarValues(lists);
  });
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
