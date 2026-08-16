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

export interface PerQuestionStat {
  question: string;
  type: "stars" | "video";
  avg: number | null;
  count: number;
}

export interface ResponseDetail {
  id: string;
  submittedAt: string;
  name: string;
  email: string;
  stars: number[];
  videos: string[];
  comments: string;
}

interface RawAnswer {
  question_id: string;
  star_value: number | null;
  video_url: string | null;
}
interface RawResponse {
  id: string;
  submitted_at: string;
  participant_name: string;
  participant_email: string | null;
  comments: string;
  feedback_answers: RawAnswer[];
}

async function loadResponses(sessionId: string): Promise<RawResponse[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_responses")
    .select("id, submitted_at, participant_name, participant_email, comments, feedback_answers(question_id, star_value, video_url)")
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
      return { question: q.text, type: "video", avg: null, count: values.filter((v) => v.video_url).length };
    }
    const stars = values.map((v) => v.star_value).filter((v): v is number => v !== null);
    return { question: q.text, type: "stars", avg: average(stars), count: stars.length };
  });

  const responses: ResponseDetail[] = rawResponses.map((r) => {
    const stars: number[] = [];
    const videos: string[] = [];
    for (const q of session.questions) {
      const a = r.feedback_answers.find((x) => x.question_id === q.id);
      if (!a) continue;
      if (q.type === "video" && a.video_url) videos.push(a.video_url);
      else if (a.star_value !== null) stars.push(a.star_value);
    }
    return {
      id: r.id,
      submittedAt: r.submitted_at,
      name: r.participant_name || "—",
      email: r.participant_email ?? "",
      stars,
      videos,
      comments: r.comments,
    };
  });

  return { session, perQuestion, responses };
}

export async function deleteFeedbackResponse(responseId: string, sessionId: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_responses").delete().eq("id", responseId).eq("feedback_session_id", sessionId);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteResponse", detail: `${sessionId} · ${responseId}`, actorProfileId });
}

export async function exportFeedbackSessionCsv(id: string): Promise<{ filename: string; csv: string } | null> {
  const session = await getFeedbackSessionBySlug(id);
  if (!session) return null;
  const rawResponses = await loadResponses(session.id);

  const header = ["Submitted On", "Participant Name", "Email", ...session.questions.map((q) => q.text + (q.type === "video" ? " (video)" : "")), "Comments"];
  const rows = [header];
  for (const r of rawResponses) {
    // Key answers by question_id so each column reflects that exact question — never a
    // positional index into a compacted array, which would misattribute answers when a
    // response skips a question of the same type earlier in the question list.
    const byQuestion = new Map(r.feedback_answers.map((a) => [a.question_id, a]));
    const line = [r.submitted_at, r.participant_name || "—", r.participant_email ?? ""];
    for (const q of session.questions) {
      const a = byQuestion.get(q.id);
      if (q.type === "video") line.push(a?.video_url ?? "");
      else line.push(a?.star_value !== null && a?.star_value !== undefined ? String(a.star_value) : "");
    }
    line.push(r.comments);
    rows.push(line);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const safeName = (session.name || "session").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "session";
  return { filename: `${safeName}.csv`, csv };
}
