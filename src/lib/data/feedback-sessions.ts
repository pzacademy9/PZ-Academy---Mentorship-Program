import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { cleanText, MAX_NAME_LEN, uniqueSlug } from "@/lib/validations/feedback";
import { average } from "@/lib/validations/feedback";
import type { PublicSession } from "@/lib/mentorship/gas";

export type FeedbackSessionStatus = Database["public"]["Enums"]["feedback_session_status"];
export type FeedbackQuestionType = Database["public"]["Enums"]["feedback_question_type"];

export interface FeedbackSessionQuestion {
  id: string;
  text: string;
  type: FeedbackQuestionType;
  order: number;
}

export interface FeedbackSessionRow {
  id: string;
  name: string;
  speakerName: string;
  sessionDate: string | null;
  status: FeedbackSessionStatus;
  slug: string;
  programId: string | null;
  programOrder: number | null;
  coverUrl: string | null;
  shareToken: string | null;
  mentorshipSessionId: string | null;
  mentorId: string | null;
  questions: FeedbackSessionQuestion[];
  responseCount: number;
  avgRating: number | null;
}

const SESSION_SELECT =
  "id, name, speaker_name, session_date, status, slug, program_id, program_order, cover_url, share_token, mentorship_session_id, mentor_id, feedback_questions(id, text, type, question_order)";

async function hydrateStats(admin: ReturnType<typeof createAdminSupabase>, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, { count: number; avg: number | null }>();
  const { data: responses } = await admin
    .from("feedback_responses")
    .select("id, feedback_session_id")
    .in("feedback_session_id", sessionIds);
  const { data: answers } = await admin
    .from("feedback_answers")
    .select("star_value, response_id, feedback_responses!inner(feedback_session_id)")
    .in("feedback_responses.feedback_session_id", sessionIds)
    .not("star_value", "is", null);

  const countBySession = new Map<string, number>();
  for (const r of responses ?? []) {
    countBySession.set(r.feedback_session_id, (countBySession.get(r.feedback_session_id) ?? 0) + 1);
  }
  const starsBySession = new Map<string, number[]>();
  for (const a of answers ?? []) {
    const sid = (a.feedback_responses as unknown as { feedback_session_id: string }).feedback_session_id;
    const list = starsBySession.get(sid) ?? [];
    list.push(a.star_value as number);
    starsBySession.set(sid, list);
  }

  const result = new Map<string, { count: number; avg: number | null }>();
  for (const id of sessionIds) {
    result.set(id, { count: countBySession.get(id) ?? 0, avg: average(starsBySession.get(id) ?? []) });
  }
  return result;
}

function toRow(
  s: {
    id: string; name: string; speaker_name: string; session_date: string | null; status: FeedbackSessionStatus;
    slug: string; program_id: string | null; program_order: number | null; cover_url: string | null;
    share_token: string | null; mentorship_session_id: string | null; mentor_id: string | null;
    feedback_questions: { id: string; text: string; type: FeedbackQuestionType; question_order: number }[] | null;
  },
  stats: { count: number; avg: number | null },
): FeedbackSessionRow {
  return {
    id: s.id,
    name: s.name,
    speakerName: s.speaker_name,
    sessionDate: s.session_date,
    status: s.status,
    slug: s.slug,
    programId: s.program_id,
    programOrder: s.program_order,
    coverUrl: s.cover_url,
    shareToken: s.share_token,
    mentorshipSessionId: s.mentorship_session_id,
    mentorId: s.mentor_id,
    questions: (s.feedback_questions ?? [])
      .map((q) => ({ id: q.id, text: q.text, type: q.type, order: q.question_order }))
      .sort((a, b) => a.order - b.order),
    responseCount: stats.count,
    avgRating: stats.avg,
  };
}

export async function listFeedbackSessions(): Promise<FeedbackSessionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("feedback_sessions").select(SESSION_SELECT).order("created_at", { ascending: false });
  const rows = data ?? [];
  const stats = await hydrateStats(admin, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, stats.get(r.id) ?? { count: 0, avg: null }));
}

/** Resolves either the raw id or the custom slug — mirrors the old getSessionById_'s dual lookup. */
export async function getFeedbackSessionBySlug(slugOrId: string): Promise<FeedbackSessionRow | null> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_sessions")
    .select(SESSION_SELECT)
    .or(`slug.eq.${slugOrId},id.eq.${slugOrId}`)
    .maybeSingle();
  if (!data) return null;
  const stats = await hydrateStats(admin, [data.id]);
  return toRow(data, stats.get(data.id) ?? { count: 0, avg: null });
}

/** Shapes a native row into the exact PublicSession contract FeedbackClient.tsx already consumes. */
export async function getNativePublicSession(slugOrId: string): Promise<PublicSession | null> {
  const row = await getFeedbackSessionBySlug(slugOrId);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    speaker: row.speakerName,
    date: row.sessionDate ?? "",
    status: row.status === "closed" ? "Closed" : "Active",
    questions: row.questions.map((q) => ({ text: q.text, type: q.type })),
    coverUrl: row.coverUrl ?? undefined,
  };
}

export interface CreateFeedbackSessionInput {
  name: string;
  speakerName: string;
  sessionDate?: string | null;
  questions: { text: string; type: FeedbackQuestionType }[];
  programId?: string | null;
  programOrder?: number | null;
  mentorshipSessionId?: string | null;
  mentorId?: string | null;
}

export async function createFeedbackSession(
  input: CreateFeedbackSessionInput,
  actorProfileId: string | null,
): Promise<{ id: string; slug: string }> {
  const admin = createAdminSupabase();
  const name = cleanText(input.name, MAX_NAME_LEN);
  const speakerName = cleanText(input.speakerName, MAX_NAME_LEN);
  if (!name) throw new Error("Session name is required.");
  if (!speakerName) throw new Error("Speaker name is required.");
  const questions = input.questions.slice(0, 5);
  if (questions.length < 3) throw new Error("Pick at least 3 questions.");

  const { data: existing } = await admin.from("feedback_sessions").select("id, slug");
  const slug = uniqueSlug(name, existing ?? [], null);

  const { data: session, error } = await admin
    .from("feedback_sessions")
    .insert({
      name,
      speaker_name: speakerName,
      session_date: input.sessionDate ?? null,
      slug,
      program_id: input.programId ?? null,
      program_order: input.programOrder ?? null,
      mentorship_session_id: input.mentorshipSessionId ?? null,
      mentor_id: input.mentorId ?? null,
    })
    .select("id")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Could not create session.");

  await admin.from("feedback_questions").insert(
    questions.map((q, i) => ({
      feedback_session_id: session.id,
      text: cleanText(q.text, 300),
      type: q.type,
      question_order: i + 1,
    })),
  );

  await logFeedbackAudit({ action: "createFeedbackSession", detail: `${session.id} · ${name}`, actorProfileId });
  return { id: session.id, slug };
}

export async function setFeedbackSessionStatus(
  id: string,
  status: FeedbackSessionStatus,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "setFeedbackSessionStatus", detail: `${id} -> ${status}`, actorProfileId });
}

export async function setFeedbackSessionCover(id: string, coverUrl: string | null, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").update({ cover_url: coverUrl }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: coverUrl ? "setCoverImage" : "removeCoverImage", detail: id, actorProfileId });
}

export async function deleteFeedbackSession(id: string, actorProfileId: string | null): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "deleteFeedbackSession", detail: id, actorProfileId });
}
