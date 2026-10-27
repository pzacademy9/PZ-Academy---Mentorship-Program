// src/lib/data/quiz-results.ts
// Server-only. Quiz results per batch session (batch_quiz_results), the remembered review
// decisions, and the live leaderboard. Live students only count on leaderboards; recorded
// students keep their saved result but are filtered out of the ranking here.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { getSessionById, isLiveEnrolled, markPresent } from "@/lib/data/attendance";
import type { KahootRow } from "@/lib/quiz/kahoot-parse";
import { matchPlayer, type AliasMap } from "@/lib/quiz/match";
import { buildBase, type FinalRow, type PersonInfo, type PriorDecision, type ReviewBase } from "@/lib/quiz/review";

export const MAX_SAVE_ROWS = 5000;
const PAGE = 1000;
const CHUNK = 200;

type DbError = { message: string; code?: string } | null;
type Page = { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: DbError }> };

function check(what: string, error: DbError): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

async function fetchAll<T>(what: string, build: () => Page): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    check(what, error);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Person id -> live or recorded, for everyone enrolled (paid or free, not test) on the batch. */
async function batchModes(pageId: string): Promise<Map<string, "live" | "recorded">> {
  const admin = createAdminSupabase();
  const regs = await fetchAll<{ person_id: string | null; mode: string }>("registrations read", () =>
    admin
      .from("landing_registrations")
      .select("person_id, mode")
      .eq("page_id", pageId)
      .in("status", ["paid", "free"])
      .eq("is_test", false)
      .order("id", { ascending: true }),
  );
  const modes = new Map<string, "live" | "recorded">();
  for (const r of regs) {
    if (!r.person_id) continue;
    if (r.mode === "live") modes.set(r.person_id, "live");
    else if (!modes.has(r.person_id)) modes.set(r.person_id, "recorded");
  }
  return modes;
}

type PersonRow = { id: string; pz_id: string; display_name: string };
async function readPeople(ids: string[]): Promise<PersonRow[]> {
  const admin = createAdminSupabase();
  const out: PersonRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await admin.from("pz_people").select("id, pz_id, display_name").in("id", ids.slice(i, i + CHUNK));
    check("people read", error);
    out.push(...((data ?? []) as PersonRow[]));
  }
  return out;
}

/** Everything the review screen needs for one uploaded report. */
export async function prepareReview(
  sessionId: string,
  rows: KahootRow[],
  questionCount: number | null,
): Promise<{ base: ReviewBase; pageId: string } | null> {
  const session = await getSessionById(sessionId);
  if (!session) return null;
  const admin = createAdminSupabase();

  const aliasRows = await fetchAll<{ alias_norm: string; person_id: string }>("aliases read", () =>
    admin.from("pz_id_aliases").select("alias_norm, person_id").order("alias_norm", { ascending: true }),
  );
  const aliases: AliasMap = new Map(aliasRows.map((a) => [a.alias_norm, a.person_id]));

  const modes = await batchModes(session.page_id);
  const wanted = new Set(modes.keys());
  for (const r of rows) {
    const m = matchPlayer(r.player, aliases);
    if (m.kind !== "unknown") wanted.add(m.personId);
  }
  const people = new Map<string, PersonInfo>();
  for (const p of await readPeople(Array.from(wanted))) {
    people.set(p.id, { personId: p.id, pzId: p.pz_id, name: p.display_name, mode: modes.get(p.id) ?? null });
  }

  const { data, error } = await admin.from("batch_quiz_decisions").select("kind, key, choice, person_id").eq("session_id", sessionId);
  check("decisions read", error);
  const decisions: PriorDecision[] = ((data ?? []) as { kind: string; key: string; choice: string; person_id: string | null }[]).map((d) => ({
    kind: d.kind as PriorDecision["kind"],
    key: d.key,
    choice: d.choice,
    personId: d.person_id,
  }));

  return { base: buildBase(rows, aliases, people, decisions, questionCount), pageId: session.page_id };
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

export type SaveInput = { maxScore: number; fileName: string; rows: FinalRow[]; decisions: PriorDecision[] };

/**
 * Replaces the session's results (one database transaction) and remembers the review decisions.
 * Validates everything first; a bad request writes nothing.
 */
export async function saveQuizResults(
  sessionId: string,
  input: SaveInput,
): Promise<{ ok: true; saved: number; notes: string[] } | { ok: false; message: string }> {
  const { rows, decisions } = input;
  if (rows.length > MAX_SAVE_ROWS) return { ok: false, message: "Too many rows." };
  if (!Number.isInteger(input.maxScore) || input.maxScore <= 0) return { ok: false, message: "The quiz maximum must be a whole number above 0." };
  const seen = new Set<string>();
  let top = 0;
  for (const r of rows) {
    if (!isCount(r.score) || !isCount(r.correct) || !isCount(r.incorrect)) return { ok: false, message: "A score is not a whole number." };
    if (seen.has(r.personId)) return { ok: false, message: "A student appears twice." };
    seen.add(r.personId);
    top = Math.max(top, r.score);
  }
  if (input.maxScore < top) return { ok: false, message: "The quiz maximum is lower than the top score." };

  const session = await getSessionById(sessionId);
  if (!session) return { ok: false, message: "Session not found." };

  const ids = Array.from(new Set([...rows.map((r) => r.personId), ...decisions.map((d) => d.personId).filter((x): x is string => !!x)]));
  const found = new Set((await readPeople(ids)).map((p) => p.id));
  if (ids.some((id) => !found.has(id))) return { ok: false, message: "A student in the list no longer exists. Upload the file again." };

  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc("batch_quiz_save", {
    p_session: sessionId,
    p_max: input.maxScore,
    p_file: input.fileName,
    p_rows: rows.map((r) => ({ person_id: r.personId, score: r.score, correct: r.correct, incorrect: r.incorrect, player: r.player })),
  });
  if (error) return { ok: false, message: "Could not save the results. Nothing was changed." };
  const saved = typeof data === "number" ? data : rows.length;

  const notes: string[] = [];
  const del = await admin.from("batch_quiz_decisions").delete().eq("session_id", sessionId);
  check("decisions clear", del.error);
  if (decisions.length > 0) {
    const ins = await admin.from("batch_quiz_decisions").insert(
      decisions.map((d) => ({ session_id: sessionId, kind: d.kind, key: d.key, choice: d.choice, person_id: d.personId })),
    );
    check("decisions save", ins.error);
  }

  // Alias fixes also become real aliases, but never overwrite an alias that points at someone else.
  const aliasFixes = decisions.filter((d) => d.kind === "alias" && d.personId);
  if (aliasFixes.length > 0) {
    const existing = await admin.from("pz_id_aliases").select("alias_norm, person_id").in("alias_norm", aliasFixes.map((d) => d.key));
    check("aliases read", existing.error);
    const owner = new Map(((existing.data ?? []) as { alias_norm: string; person_id: string }[]).map((a) => [a.alias_norm, a.person_id]));
    const fresh = aliasFixes.filter((d) => !owner.has(d.key));
    for (const d of aliasFixes) {
      const o = owner.get(d.key);
      if (o && o !== d.personId) notes.push(`"${d.key}" already belongs to another student, so it was not changed.`);
    }
    if (fresh.length > 0) {
      const up = await admin
        .from("pz_id_aliases")
        .upsert(fresh.map((d) => ({ alias_norm: d.key, person_id: d.personId as string, source: "review" })), { onConflict: "alias_norm", ignoreDuplicates: true });
      check("aliases save", up.error);
    }
  }
  return { ok: true, saved, notes };
}

export type LeaderRow = {
  rank: number;
  personId: string;
  pzId: string;
  name: string;
  total: number;
  quizzes: number;
  avgPct: number | null;
  projectedTotal: number | null;
};

type ResultRow = Pick<Tables<"batch_quiz_results">, "session_id" | "person_id" | "score" | "correct" | "incorrect">;

async function resultsFor(sessionIds: string[]): Promise<ResultRow[]> {
  const admin = createAdminSupabase();
  const out: ResultRow[] = [];
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const part = sessionIds.slice(i, i + CHUNK);
    out.push(
      ...(await fetchAll<ResultRow>("results read", () =>
        admin.from("batch_quiz_results").select("session_id, person_id, score, correct, incorrect").in("session_id", part).order("id", { ascending: true }),
      )),
    );
  }
  return out;
}

/** Combined ranking of a batch: live students only, total score first, ties share a rank. */
export async function getBatchLeaderboard(pageId: string): Promise<{ rows: LeaderRow[]; sessionCount: number }> {
  const admin = createAdminSupabase();
  const { data: sess, error } = await admin.from("batch_sessions").select("id, quiz_max_score").eq("page_id", pageId);
  check("sessions read", error);
  const sessions = (sess ?? []) as { id: string; quiz_max_score: number | null }[];
  const maxOf = new Map(sessions.map((s) => [s.id, s.quiz_max_score]));
  const sessionCount = sessions.length;

  const modes = await batchModes(pageId);
  const results = (await resultsFor(sessions.map((s) => s.id))).filter((r) => modes.get(r.person_id) === "live");

  const agg = new Map<string, { total: number; quizzes: number; pcts: number[] }>();
  for (const r of results) {
    const a = agg.get(r.person_id) ?? { total: 0, quizzes: 0, pcts: [] };
    a.total += r.score;
    a.quizzes += 1;
    const max = maxOf.get(r.session_id);
    if (max && max > 0) a.pcts.push(Math.min(100, (r.score / max) * 100));
    agg.set(r.person_id, a);
  }
  const people = new Map((await readPeople(Array.from(agg.keys()))).map((p) => [p.id, p]));

  const sorted = Array.from(agg.entries())
    .map(([personId, a]) => ({ personId, a, p: people.get(personId) }))
    .filter((x): x is { personId: string; a: { total: number; quizzes: number; pcts: number[] }; p: PersonRow } => !!x.p)
    .sort((x, y) => y.a.total - x.a.total || x.p.display_name.localeCompare(y.p.display_name));

  let prevTotal = -1;
  let prevRank = 0;
  const rows: LeaderRow[] = sorted.map((x, i) => {
    const rank = x.a.total === prevTotal ? prevRank : i + 1;
    prevTotal = x.a.total;
    prevRank = rank;
    return {
      rank,
      personId: x.personId,
      pzId: x.p.pz_id,
      name: x.p.display_name,
      total: x.a.total,
      quizzes: x.a.quizzes,
      avgPct: x.a.pcts.length ? Math.round(x.a.pcts.reduce((s, v) => s + v, 0) / x.a.pcts.length) : null,
      projectedTotal: x.a.quizzes > 0 ? Math.round((x.a.total / x.a.quizzes) * sessionCount) : null,
    };
  });
  return { rows, sessionCount };
}

export type SessionQuizRow = { personId: string; pzId: string; name: string; mode: "live" | "recorded" | null; score: number; correct: number; incorrect: number };

/** Saved results of one session, recorded students included and tagged. */
export async function getSessionQuiz(sessionId: string): Promise<{
  saved: boolean;
  maxScore: number | null;
  fileName: string | null;
  savedAt: string | null;
  rows: SessionQuizRow[];
}> {
  const session = await getSessionById(sessionId);
  if (!session) return { saved: false, maxScore: null, fileName: null, savedAt: null, rows: [] };
  const results = await resultsFor([sessionId]);
  const modes = await batchModes(session.page_id);
  const people = new Map((await readPeople(results.map((r) => r.person_id))).map((p) => [p.id, p]));
  const rows: SessionQuizRow[] = results
    .map((r) => ({
      personId: r.person_id,
      pzId: people.get(r.person_id)?.pz_id ?? "",
      name: people.get(r.person_id)?.display_name ?? "",
      mode: modes.get(r.person_id) ?? null,
      score: r.score,
      correct: r.correct,
      incorrect: r.incorrect,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return {
    saved: !!session.quiz_saved_at,
    maxScore: session.quiz_max_score,
    fileName: session.quiz_file_name,
    savedAt: session.quiz_saved_at,
    rows,
  };
}

/** Live students who have a quiz result for the session but no check-in. */
export async function listQuizWithoutCheckin(sessionId: string): Promise<{ personId: string; pzId: string; name: string }[]> {
  const session = await getSessionById(sessionId);
  if (!session) return [];
  const admin = createAdminSupabase();
  const modes = await batchModes(session.page_id);
  const results = (await resultsFor([sessionId])).filter((r) => modes.get(r.person_id) === "live");
  const marks = await fetchAll<{ person_id: string }>("marks read", () =>
    admin.from("batch_session_marks").select("person_id").eq("session_id", sessionId).order("id", { ascending: true }),
  );
  const present = new Set(marks.map((m) => m.person_id));
  const missing = results.filter((r) => !present.has(r.person_id)).map((r) => r.person_id);
  return (await readPeople(missing))
    .map((p) => ({ personId: p.id, pzId: p.pz_id, name: p.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One admin click: markPresent does not check enrolment, so check it here. */
export async function markPresentFromQuiz(
  sessionId: string,
  personId: string,
  adminId: string,
): Promise<{ ok: boolean; message?: string }> {
  const session = await getSessionById(sessionId);
  if (!session) return { ok: false, message: "Session not found." };
  if (!(await isLiveEnrolled(session.page_id, personId))) return { ok: false, message: "This student is not a live student of this batch." };
  await markPresent(sessionId, personId, "admin", adminId);
  return { ok: true };
}
