import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getFeedbackSessionBySlug } from "@/lib/data/feedback-sessions";
import {
  cleanText, isValidEmail, sanitizeAnswer, isHttpUrl,
  MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_COMMENTS_LEN,
  withinRateLimit, isDuplicateSubmission,
} from "@/lib/validations/feedback";

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

  return { ok: true };
}
