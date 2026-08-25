import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionBySlug, type FeedbackSessionRow } from "@/lib/data/feedback-sessions";
import {
  cleanText, isValidEmail, sanitizeAnswer, isHttpUrl,
  MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_COMMENTS_LEN,
  withinRateLimit, isDuplicateSubmission,
  average, csvCell,
} from "@/lib/validations/feedback";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { recomputeTierForFeedbackSession } from "@/lib/data/mentor-tiers";

const RATE_MAX_SUBMITS = 3;
const RATE_WINDOW_MS = 60_000;
const DUPLICATE_WINDOW_MS = 5 * 60_000;

export interface SubmitFeedbackInput {
  sessionId: string;
  name: string;
  email: string;
  website: string; // honeypot
  comments: string;
  answers: { question: string; answer: string | number }[];
  participantProfileId: string | null;
}

export type SubmitFeedbackResult = { ok: true } | { ok: false; message: string };

export async function submitFeedbackResponse(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
  if (input.website) return { ok: true }; // honeypot — silently drop bots

  const session = await getFeedbackSessionBySlug(input.sessionId);
  if (!session) return { ok: false, message: "This feedback link is not valid." };
  if (session.status === "closed") return { ok: false, message: "This session is closed for feedback." };

  const name = cleanText(input.name, MAX_NAME_LEN);
  const email = cleanText(input.email, MAX_EMAIL_LEN);
  const comments = cleanText(input.comments, MAX_COMMENTS_LEN);
  if (email && !isValidEmail(email)) return { ok: false, message: "Please enter a valid email address." };

  const answersInput = Array.isArray(input.answers) ? input.answers : [];
  const cleanAnswers = answersInput.slice(0, 5).map((a) => ({
    question: cleanText(a?.question, 300),
    answer: sanitizeAnswer(a?.answer),
  }));
  if (!cleanAnswers.some((a) => a.answer !== "")) return { ok: false, message: "Please rate at least one question." };

  const admin = createAdminSupabase();

  // Session-scoped rate limit — applies to EVERY submission unconditionally,
  // independent of whether an email was supplied. participant_email is
  // nullable and this endpoint is unauthenticated, so the email-keyed check
  // below (kept as an additional layer when email IS present) was the only
  // guard on this path — a POST with email: "" faced no rate limit or
  // duplicate check at all. This uses the existing feedback_responses_
  // session_id_idx index, so it's cheap even at higher submission volume.
  // Reuses RATE_MAX_SUBMITS/RATE_WINDOW_MS as-is (no new tuning constant).
  const sinceSession = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: sessionCount } = await admin
    .from("feedback_responses")
    .select("id", { count: "exact", head: true })
    .eq("feedback_session_id", session.id)
    .gte("submitted_at", sinceSession);
  if (!withinRateLimit(sessionCount ?? 0, RATE_MAX_SUBMITS)) {
    return { ok: false, message: "Too many submissions. Please wait a moment and try again." };
  }

  if (email) {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await admin
      .from("feedback_responses")
      .select("id", { count: "exact", head: true })
      .eq("feedback_session_id", session.id)
      .eq("participant_email", email)
      .gte("submitted_at", since);
    if (!withinRateLimit(count ?? 0, RATE_MAX_SUBMITS)) {
      return { ok: false, message: "Too many submissions. Please wait a moment and try again." };
    }

    const { data: last } = await admin
      .from("feedback_responses")
      .select("submitted_at")
      .eq("feedback_session_id", session.id)
      .eq("participant_email", email)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isDuplicateSubmission(last?.submitted_at ?? null, DUPLICATE_WINDOW_MS)) {
      return { ok: false, message: "Looks like this feedback was already submitted. Thank you!" };
    }
  }

  const { data: response, error } = await admin
    .from("feedback_responses")
    .insert({
      feedback_session_id: session.id,
      participant_name: name,
      participant_email: email || null,
      participant_profile_id: input.participantProfileId,
      comments,
    })
    .select("id")
    .single();
  if (error || !response) return { ok: false, message: "Could not submit feedback. Please try again." };

  const answerRows = session.questions
    .map((q, i) => {
      const a = cleanAnswers[i];
      if (!a || a.answer === "") return null;
      const isVideo = typeof a.answer === "string" && isHttpUrl(a.answer);
      return {
        response_id: response.id,
        question_id: q.id,
        star_value: isVideo ? null : (a.answer as number),
        video_url: isVideo ? (a.answer as string) : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (answerRows.length > 0) {
    const { error: answersError } = await admin.from("feedback_answers").insert(answerRows);
    if (answersError) return { ok: false, message: "Could not save your answers. Please try again." };
  }

  // Dynamic import avoids a circular import: feedback-mentorship-sync.ts already imports from this file.
  const { syncMentorshipFeedbackToSession } = await import("@/lib/data/feedback-mentorship-sync");
  await syncMentorshipFeedbackToSession(session.id);

  // A new public review moves both reviewCount and ratingAvg. Never throws.
  await recomputeTierForFeedbackSession(session.id);

  return { ok: true };
}

export interface PerQuestionStat {
  id: string;
  question: string;
  type: "stars" | "video";
  avg: number | null;
  count: number;
}

/** A response's answer to one question, keyed by that question's id — see KeyedAnswer/keyAnswersByQuestionId. */
export interface KeyedAnswer {
  starValue: number | null;
  videoUrl: string | null;
}

export interface ResponseDetail {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  answers: Record<string, KeyedAnswer>;
  comments: string;
  isPublic: boolean;
  isFeatured: boolean;
}

interface RawAnswer {
  question_id: string;
  star_value: number | null;
  video_url: string | null;
}

/**
 * Keys a response's raw feedback_answers rows by question_id.
 *
 * Replaces the old push-based `stars: number[]` / `videos: string[]` shape,
 * which only grew an entry when an answer existed. That compaction silently
 * misattributed answers: a response that skipped a non-last question of a
 * given type shifted every later same-type answer into the wrong slot when
 * rendered against `starQuestions.map((q, i) => r.stars[i])`. Callers look
 * up `answers[question.id]` directly instead of by array position, so a
 * missing answer is a genuine gap, never a shift. This exact bug class was
 * already fixed twice elsewhere in this system (exportFeedbackSessionCsv's
 * question_id-keyed Map, and feedback-share.ts's toShareSession).
 */
export function keyAnswersByQuestionId(answers: RawAnswer[]): Record<string, KeyedAnswer> {
  const out: Record<string, KeyedAnswer> = {};
  for (const a of answers) {
    out[a.question_id] = { starValue: a.star_value, videoUrl: a.video_url };
  }
  return out;
}

interface RawResponse {
  id: string;
  submitted_at: string;
  participant_name: string;
  participant_email: string | null;
  comments: string;
  is_public: boolean;
  is_featured: boolean;
  feedback_answers: RawAnswer[];
}

async function loadResponses(sessionId: string): Promise<RawResponse[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select(
      "id, submitted_at, participant_name, participant_email, comments, is_public, is_featured, feedback_answers(question_id, star_value, video_url)",
    )
    .eq("feedback_session_id", sessionId)
    .order("submitted_at", { ascending: false });
  return data ?? [];
}

export async function getFeedbackSessionDetail(
  id: string,
): Promise<{ session: FeedbackSessionRow; perQuestion: PerQuestionStat[]; responses: ResponseDetail[] } | null> {
  const session = await getFeedbackSessionBySlug(id);
  if (!session) return null;
  const rawResponses = await loadResponses(session.id);

  const perQuestion: PerQuestionStat[] = session.questions.map((q) => {
    const values = rawResponses
      .flatMap((r) => r.feedback_answers)
      .filter((a) => a.question_id === q.id);
    if (q.type === "video") {
      return { id: q.id, question: q.text, type: "video", avg: null, count: values.filter((v) => v.video_url).length };
    }
    const stars = values.map((v) => v.star_value).filter((v): v is number => v !== null);
    return { id: q.id, question: q.text, type: "stars", avg: average(stars), count: stars.length };
  });

  const responses: ResponseDetail[] = rawResponses.map((r) => ({
    id: r.id,
    submittedAt: r.submitted_at,
    name: r.participant_name || "—",
    email: r.participant_email ?? "",
    answers: keyAnswersByQuestionId(r.feedback_answers),
    comments: r.comments,
    isPublic: r.is_public,
    isFeatured: r.is_featured,
  }));

  return { session, perQuestion, responses };
}

export async function deleteFeedbackResponse(responseId: string, sessionId: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_responses").delete().eq("id", responseId).eq("feedback_session_id", sessionId);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteResponse", detail: `${sessionId} · ${responseId}`, actorProfileId });
  // A review was removed. Never throws.
  await recomputeTierForFeedbackSession(sessionId);
}

/**
 * Per-response mentor-profile visibility, admin-controlled from the session
 * detail page. Deliberately does NOT affect exportFeedbackSessionCsv or
 * feedback-share.ts's toShareSession/getNativeShareView — those are the
 * session's own admin CSV export and /review/{token} public page, both
 * scoped to a single feedback session and already gated by the admin's own
 * share-token generation. "Hidden" only removes a response from the
 * cross-session mentor-profile aggregation (src/lib/data/mentor-reviews.ts).
 */
export async function setResponseVisibility(
  responseId: string,
  sessionId: string,
  isPublic: boolean,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("feedback_responses")
    .update({ is_public: isPublic })
    .eq("id", responseId)
    .eq("feedback_session_id", sessionId);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({
    action: isPublic ? "showResponse" : "hideResponse",
    detail: `${sessionId} · ${responseId}`,
    actorProfileId,
  });
  // is_public is the sole moderation gate in the tier rollup. Never throws.
  await recomputeTierForFeedbackSession(sessionId);
}

/**
 * Per-response "Featured" flag on the public mentor-profile reviews section.
 * Purely cosmetic (border+pill treatment in MentorReviews.tsx) — does not
 * affect ordering or inclusion, and is independent of is_public (a hidden
 * response can still be featured; it just won't show until unhidden).
 */
export async function setResponseFeatured(
  responseId: string,
  sessionId: string,
  isFeatured: boolean,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("feedback_responses")
    .update({ is_featured: isFeatured })
    .eq("id", responseId)
    .eq("feedback_session_id", sessionId);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({
    action: isFeatured ? "featureResponse" : "unfeatureResponse",
    detail: `${sessionId} · ${responseId}`,
    actorProfileId,
  });
}

export async function exportFeedbackSessionCsv(id: string): Promise<{ filename: string; csv: string } | null> {
  // Reuses getFeedbackSessionDetail's already-keyed-by-question_id answers
  // instead of re-deriving them here — this file used to run its own
  // loadResponses() + per-response Map build (see the Important-5 fix ledger
  // note in the final-review-fix-report), which was itself already correct
  // (keyed by question_id, not positional) but duplicated getFeedbackSessionDetail's
  // work now that ResponseDetail.answers is keyed the same way.
  const detail = await getFeedbackSessionDetail(id);
  if (!detail) return null;
  const { session, responses } = detail;

  const header = ["Submitted On", "Participant Name", "Email", ...session.questions.map((q) => q.text + (q.type === "video" ? " (video)" : "")), "Comments"];
  const rows = [header];
  for (const r of responses) {
    const line: string[] = [r.submittedAt, r.name, r.email];
    for (const q of session.questions) {
      const a = r.answers[q.id];
      if (q.type === "video") line.push(a?.videoUrl ?? "");
      else line.push(a?.starValue != null ? String(a.starValue) : "");
    }
    line.push(r.comments);
    rows.push(line);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const safeName = (session.name || "session").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "session";
  return { filename: `${safeName}.csv`, csv };
}
