import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { logFeedbackAudit } from "@/lib/data/feedback-audit";
import { generateFeedbackShareToken } from "@/lib/data/feedback-share";
import { cleanText, MAX_NAME_LEN, uniqueSlug, randomSlugSuffix } from "@/lib/validations/feedback";
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

/**
 * Computed in Postgres via feedback_session_stats (migration 0034), not
 * fetched-then-averaged in JS. The old version pulled every
 * feedback_responses row and every star-valued feedback_answers row across
 * all requested sessions into JS to average there — past PostgREST's row
 * cap (commonly 1000 via db-max-rows), those computed averages went wrong
 * with no error. One row per session comes back regardless of how many
 * responses/answers sit underneath it.
 */
async function hydrateStats(admin: ReturnType<typeof createAdminSupabase>, sessionIds: string[]) {
  const result = new Map<string, { count: number; avg: number | null }>();
  for (const id of sessionIds) result.set(id, { count: 0, avg: null });
  if (sessionIds.length === 0) return result;

  const { data, error } = await admin.rpc("feedback_session_stats", { p_session_ids: sessionIds });
  if (error) return result; // fall back to zeroed stats rather than throwing on a list page
  for (const row of data ?? []) {
    result.set(row.feedback_session_id, {
      count: Number(row.response_count),
      avg: row.avg_star != null ? Number(row.avg_star) : null,
    });
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

/**
 * Mentor-scoped listing — filters `feedback_sessions.mentor_id` in the query
 * itself instead of the old pattern of `(await listFeedbackSessions()).filter(s
 * => s.mentorId === mentor.id)`, which fetched every session's stats (all
 * sessions, not just this mentor's) before throwing most of it away in JS.
 * Used by both the mentor feedback list page and its API route.
 */
export async function listFeedbackSessionsForMentor(mentorId: string): Promise<FeedbackSessionRow[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_sessions")
    .select(SESSION_SELECT)
    .eq("mentor_id", mentorId)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const stats = await hydrateStats(admin, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, stats.get(r.id) ?? { count: 0, avg: null }));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is shaped like a Postgres uuid literal (feedback_sessions.id's column type). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Resolves either the raw id or the custom slug — mirrors the old getSessionById_'s dual lookup.
 *
 * `feedback_sessions.id` is `uuid` and `feedback_sessions.slug` is `text`. A single
 * `.or("slug.eq.x,id.eq.x")` filter asks PostgREST to evaluate BOTH clauses against
 * the same string, and Postgres tries to cast `x` to `uuid` for the `id.eq.` clause
 * even when the caller only intended to match on slug. A non-UUID slug fails that
 * cast with `22P02 invalid input syntax for type uuid`, which fails the WHOLE query
 * (not just that clause) — so we branch on the input's shape instead and only ever
 * send a UUID-shaped string into the `id` comparison.
 */
export async function getFeedbackSessionBySlug(slugOrId: string): Promise<FeedbackSessionRow | null> {
  const admin = createAdminSupabase();
  const query = admin.from("feedback_sessions").select(SESSION_SELECT);
  const { data } = isUuid(slugOrId)
    ? await query.eq("id", slugOrId).maybeSingle()
    : await query.eq("slug", slugOrId).maybeSingle();
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
  /**
   * Appends a short crypto-random suffix to the generated slug (see
   * randomSlugSuffix()) instead of leaving it fully derived from `name`.
   * Set by freezeMentorshipFeedbackSession — a mentorship-derived session's
   * name is built from `scheduled_at`, so its slug would otherwise slugify
   * to a guessable `mentorship-session-<iso-timestamp>` with no auth gate
   * of its own (the slug IS the access token for /feedback/[id]).
   */
  randomizeSlug?: boolean;
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
  let slug = uniqueSlug(name, existing ?? [], null);
  if (input.randomizeSlug) slug = `${slug}-${randomSlugSuffix()}`;

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

  // Every session gets a public review link from the moment it exists, not only
  // after an admin later clicks "Generate Share Link". generateFeedbackShareToken
  // is idempotent (reuses an existing token), so calling it unconditionally here
  // is safe even though nothing about this session's token could exist yet.
  await generateFeedbackShareToken("session", session.id, actorProfileId);

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

export async function setFeedbackSessionMentor(
  id: string,
  mentorId: string | null,
  actorProfileId: string | null,
): Promise<void> {
  const admin = createAdminSupabase();
  const { error } = await admin.from("feedback_sessions").update({ mentor_id: mentorId }).eq("id", id);
  if (error) throw new Error(error.message);
  await logFeedbackAudit({ action: "setFeedbackSessionMentor", detail: `${id} -> ${mentorId ?? "none"}`, actorProfileId });
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
