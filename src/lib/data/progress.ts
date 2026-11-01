// src/lib/data/progress.ts
// Server-only loader for the public "Track Your Progress" page. Looks up ONE person by PZ ID
// and returns only what the builder keeps: first name, PZ ID, batch/class names, own marks and scores.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { audienceFromJson } from "@/lib/classes/audience";
import { normalizePzId, PZ_ID_SHAPE } from "@/lib/pzid/format";
import { fetchAll } from "@/lib/data/attendance";
import {
  buildProgress,
  type BatchInput,
  type MarkSource,
  type Progress,
  type ProgressKind,
  type SessionInput,
} from "@/lib/progress/build";

const CHUNK = 200;
const MAX_ID_LENGTH = 40;
const KINDS: string[] = ["course", "workshop", "webinar"];

type DbError = { message: string } | null;
function check(what: string, error: DbError): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

type Person = { id: string; pz_id: string; display_name: string };
type Reg = { page_id: string; mode: string; option_label: string };
type Page = { id: string; title: string; slug: string; kind: string; attendance_min_pct: number };
type SessionRow = {
  id: string;
  page_id: string;
  number: number;
  title: string;
  starts_at: string;
  audience: unknown;
  quiz_max_score: number | null;
};

async function findPerson(norm: string): Promise<Person | null> {
  const admin = createAdminSupabase();
  const { data: alias, error: aErr } = await admin.from("pz_id_aliases").select("person_id").eq("alias_norm", norm).maybeSingle();
  check("alias read", aErr);
  let q = admin.from("pz_people").select("id, pz_id, display_name");
  const personId = (alias as { person_id: string } | null)?.person_id;
  q = personId ? q.eq("id", personId) : q.ilike("pz_id", norm);
  const { data, error } = await q.maybeSingle();
  check("person read", error);
  return (data as Person | null) ?? null;
}

/**
 * Progress of the person who owns this PZ ID, or null for anything not found
 * (malformed, unknown, or a person with no paid/free non-test enrolment in a published or closed batch).
 * A read that fails throws; it never returns a partial answer.
 */
export async function getProgressByPzId(raw: string, now: Date = new Date()): Promise<Progress | null> {
  const norm = normalizePzId(typeof raw === "string" ? raw : "");
  if (norm.length === 0 || norm.length > MAX_ID_LENGTH || !PZ_ID_SHAPE.test(norm)) return null;

  const person = await findPerson(norm);
  if (!person) return null;

  const admin = createAdminSupabase();

  const regs = await fetchAll<Reg>("registrations read", () =>
    admin
      .from("landing_registrations")
      .select("page_id, mode, option_label")
      .eq("person_id", person.id)
      .in("status", ["paid", "free"])
      .eq("is_test", false)
      .order("id", { ascending: true }),
  );
  if (regs.length === 0) return null;

  // One registration per batch: a live one wins over a recorded one.
  const regByPage = new Map<string, Reg>();
  for (const r of regs) {
    const prev = regByPage.get(r.page_id);
    if (!prev || (prev.mode !== "live" && r.mode === "live")) regByPage.set(r.page_id, r);
  }

  const pages: Page[] = [];
  for (const part of chunks(Array.from(regByPage.keys()))) {
    const { data, error } = await admin
      .from("landing_pages")
      .select("id, title, slug, status, kind, attendance_min_pct")
      .in("id", part)
      .in("status", ["published", "closed"]);
    check("batches read", error);
    pages.push(...((data ?? []) as Page[]).filter((p) => KINDS.includes(p.kind)));
  }
  if (pages.length === 0) return null;
  const pageIds = pages.map((p) => p.id);

  const sessions: SessionRow[] = [];
  for (const part of chunks(pageIds)) {
    sessions.push(
      ...(await fetchAll<SessionRow>("sessions read", () =>
        admin
          .from("batch_sessions")
          .select("id, page_id, number, title, starts_at, audience, quiz_max_score")
          .in("page_id", part)
          .order("id", { ascending: true }),
      )),
    );
  }
  const sessionIds = sessions.map((s) => s.id);

  // This person's own marks.
  const markOf = new Map<string, MarkSource>();
  for (const part of chunks(sessionIds)) {
    const marks = await fetchAll<{ session_id: string; source: MarkSource }>("marks read", () =>
      admin
        .from("batch_session_marks")
        .select("session_id, source")
        .eq("person_id", person.id)
        .in("session_id", part)
        .order("id", { ascending: true }),
    );
    for (const m of marks) markOf.set(m.session_id, m.source);
  }

  // Every saved score for these classes; kept only as the person's own score or an anonymous live number.
  const results: { session_id: string; person_id: string; score: number }[] = [];
  for (const part of chunks(sessionIds)) {
    results.push(
      ...(await fetchAll<{ session_id: string; person_id: string; score: number }>("quiz results read", () =>
        admin
          .from("batch_quiz_results")
          .select("session_id, person_id, score")
          .in("session_id", part)
          .order("id", { ascending: true }),
      )),
    );
  }

  // Who is live in each batch (needed for the rank). Only read for batches where this person is live.
  const liveByPage = new Map<string, Set<string>>();
  const liveMine = pageIds.filter((id) => regByPage.get(id)?.mode === "live");
  for (const part of chunks(liveMine)) {
    const rows = await fetchAll<{ page_id: string; person_id: string | null }>("live students read", () =>
      admin
        .from("landing_registrations")
        .select("page_id, person_id")
        .in("page_id", part)
        .in("status", ["paid", "free"])
        .eq("is_test", false)
        .eq("mode", "live")
        .order("id", { ascending: true }),
    );
    for (const r of rows) {
      if (!r.person_id) continue;
      const set = liveByPage.get(r.page_id) ?? new Set<string>();
      set.add(r.person_id);
      liveByPage.set(r.page_id, set);
    }
  }

  const batches: BatchInput[] = pages.map((p) => {
    const reg = regByPage.get(p.id)!;
    const live = liveByPage.get(p.id) ?? new Set<string>();
    const mine = sessions.filter((s) => s.page_id === p.id);
    const sessionInputs: SessionInput[] = [];
    for (const s of mine) {
      const audience = s.audience === null || s.audience === undefined ? null : audienceFromJson(s.audience);
      // A stored audience that cannot be read is never trusted: the class is left out.
      if (s.audience !== null && s.audience !== undefined && audience === null) continue;
      sessionInputs.push({ id: s.id, number: s.number, title: s.title, startsAt: s.starts_at, audience, quizMax: s.quiz_max_score });
    }
    const keep = new Set(sessionInputs.map((s) => s.id));
    const marks: BatchInput["marks"] = {};
    const myScores: BatchInput["myScores"] = {};
    const liveScores: BatchInput["liveScores"] = {};
    for (const s of mine) {
      const src = markOf.get(s.id);
      if (src && keep.has(s.id)) marks[s.id] = src;
    }
    const mineIds = new Set(mine.map((s) => s.id));
    for (const r of results) {
      if (!mineIds.has(r.session_id)) continue;
      if (r.person_id === person.id) myScores[r.session_id] = r.score;
      if (live.has(r.person_id)) (liveScores[r.session_id] ??= []).push(r.score);
    }
    return {
      pageId: p.id,
      title: p.title,
      slug: p.slug,
      kind: p.kind as ProgressKind,
      minPct: p.attendance_min_pct,
      mode: reg.mode === "live" ? "live" : "recorded",
      optionLabel: reg.option_label,
      sessions: sessionInputs,
      marks,
      myScores,
      liveScores,
    };
  });

  return buildProgress({ person: { displayName: person.display_name, pzId: person.pz_id }, batches, now });
}
