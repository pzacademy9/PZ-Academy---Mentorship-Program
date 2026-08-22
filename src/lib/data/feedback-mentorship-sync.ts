import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createFeedbackSession } from "@/lib/data/feedback-sessions";
import { getMentorshipDefaultQuestions } from "@/lib/data/feedback-question-bank";
import { getFeedbackSessionDetail } from "@/lib/data/feedback-responses";
import { average } from "@/lib/validations/feedback";

/**
 * Called at the same commit as a mentorship session's transition to
 * 'completed' — freezing this here, not lazily when the student later opens
 * a feedback link, mirrors the sessions_total lesson from subsystem C:
 * anything a later UI needs to read must be written at the state-transition
 * commit point.
 */
export async function freezeMentorshipFeedbackSession(mentorshipSessionId: string): Promise<void> {
  const admin = createAdminSupabase();

  const { data: existing } = await admin
    .from("feedback_sessions")
    .select("id")
    .eq("mentorship_session_id", mentorshipSessionId)
    .maybeSingle();
  if (existing) return; // idempotent — a session can only complete once in practice, but never double-freeze

  const { data: session } = await admin
    .from("sessions")
    .select("id, mentor_id, scheduled_at")
    .eq("id", mentorshipSessionId)
    .maybeSingle();
  if (!session) return;

  const { data: mentorRow } = await admin.from("mentors").select("id, name").eq("profile_id", session.mentor_id).maybeSingle();
  if (!mentorRow) {
    console.warn(`[feedback-mentorship-sync] session ${mentorshipSessionId} has no linked mentors row for profile ${session.mentor_id} — skipping freeze.`);
    return; // no linked mentors row — nothing to attribute the feedback session to
  }

  const questions = await getMentorshipDefaultQuestions();
  if (questions.length < 3) {
    console.warn(`[feedback-mentorship-sync] question bank has only ${questions.length} mentorship-default questions — skipping freeze for session ${mentorshipSessionId}.`);
    return; // bank not seeded with enough mentorship defaults yet — surfaced by the seed migration normally
  }

  // Best-effort from here: the mentorship session's status transition already committed above
  // (setSessionStatus already updated sessions.status='completed' before calling us), so a failure
  // creating the feedback_sessions row must never throw back into that transition and make a
  // successful completion look like it failed.
  try {
    await createFeedbackSession(
      {
        name: `Mentorship session — ${session.scheduled_at ?? mentorshipSessionId}`,
        speakerName: mentorRow.name,
        sessionDate: session.scheduled_at,
        questions: questions.map((q) => ({ text: q.text, type: q.type })),
        mentorshipSessionId: session.id,
        mentorId: mentorRow.id,
        // The display name above is derived from scheduled_at — without this,
        // the slug (this session's only access gate at /feedback/[id]) would
        // slugify to a guessable mentorship-session-<iso-timestamp>.
        randomizeSlug: true,
      },
      null,
    );
  } catch (error) {
    console.error(`[feedback-mentorship-sync] failed to freeze feedback session for mentorship session ${mentorshipSessionId}:`, error);
  }
}

/** Writes the aggregate rating/comments back onto sessions.rating/student_feedback after a mentorship feedback response comes in. mentor_notes is untouched — that's the deferred mentor-notes feature. */
export async function syncMentorshipFeedbackToSession(feedbackSessionId: string): Promise<void> {
  const admin = createAdminSupabase();
  const { data: fs } = await admin
    .from("feedback_sessions")
    .select("id, mentorship_session_id")
    .eq("id", feedbackSessionId)
    .maybeSingle();
  if (!fs?.mentorship_session_id) return;

  const detail = await getFeedbackSessionDetail(fs.id);
  if (!detail) return;
  const starAvgs = detail.perQuestion.filter((q) => q.type !== "video" && q.avg != null).map((q) => q.avg as number);
  const overall = average(starAvgs);
  const latestComment = detail.responses[0]?.comments ?? null;

  await admin
    .from("sessions")
    .update({ rating: overall != null ? Math.round(overall) : null, student_feedback: latestComment })
    .eq("id", fs.mentorship_session_id);

  await notifyMentorOfFeedback(fs.mentorship_session_id, detail.responses[0]?.name ?? null);
}

/**
 * Best-effort — mirrors notifyAdminsOfSheetDowngrade's insert shape (same
 * notifications table, no new infra). Must never throw back into the caller:
 * the rating/student_feedback write above already committed.
 */
async function notifyMentorOfFeedback(mentorshipSessionId: string, participantName: string | null): Promise<void> {
  const admin = createAdminSupabase();
  try {
    const { data: session } = await admin.from("sessions").select("mentor_id").eq("id", mentorshipSessionId).maybeSingle();
    if (!session?.mentor_id) return;

    await admin.from("notifications").insert({
      user_id: session.mentor_id,
      type: "mentorship_feedback_received",
      title: "New feedback received",
      body: participantName ? `${participantName} left feedback for your session.` : "A mentee left feedback for your session.",
      link: "/dashboard/mentor",
    });
  } catch (error) {
    console.error(`[feedback-mentorship-sync] failed to notify mentor for session ${mentorshipSessionId}:`, error);
  }
}
