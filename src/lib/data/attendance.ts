// src/lib/data/attendance.ts
// Server-only. Live sessions of a batch (batch_sessions) and who attended (batch_session_marks).
// Admin writes are never limited by the check-in window or the session start time.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";
import {
  attendancePercent,
  generateSessionCode,
  meetsMinimum,
  type WindowOverride,
} from "@/lib/attendance/rules";

export type SessionRow = Tables<"batch_sessions">;
export type SessionInput = {
  number: number;
  title: string;
  startsAt: string;
  zoomUrl: string;
  kahootUrl: string;
  includeKahoot: boolean;
  includeAttendanceLink: boolean;
  emailEnabled: boolean;
  emailLeadMinutes: number;
};
export type GridRow = {
  personId: string;
  pzId: string;
  name: string;
  marks: Record<string, boolean>;
  started: number;
  marked: number;
  pct: number | null;
  meetsMin: boolean;
};

const PAGE = 1000;
const CHUNK = 200;
const DUP_NUMBER = "Session number already used";

type DbError = { message: string; code?: string } | null;
type Page = { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: DbError }> };

function check(what: string, error: DbError): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/** Reads every row, 1000 at a time. build() must order by a unique column so pages are stable. */
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

const isDuplicate = (e: DbError) => !!e && (e.code === "23505" || /duplicate key/i.test(e.message));

/** Registrations that count as enrolled: paid or free, not test, linked to a person. */
type EnrolledReg = { person_id: string; mode: string };
async function enrolledRegs(pageId: string, personId?: string): Promise<EnrolledReg[]> {
  const admin = createAdminSupabase();
  const rows = await fetchAll<{ person_id: string | null; mode: string }>("registrations read", () => {
    let q = admin
      .from("landing_registrations")
      .select("person_id, mode")
      .eq("page_id", pageId)
      .in("status", ["paid", "free"])
      .eq("is_test", false);
    if (personId) q = q.eq("person_id", personId);
    return q.order("id", { ascending: true });
  });
  return rows.filter((r): r is EnrolledReg => !!r.person_id);
}

async function livePersonIds(pageId: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const r of await enrolledRegs(pageId)) if (r.mode === "live") ids.add(r.person_id);
  return Array.from(ids);
}

export async function listSessions(pageId: string): Promise<SessionRow[]> {
  const { data, error } = await createAdminSupabase()
    .from("batch_sessions")
    .select("*")
    .eq("page_id", pageId)
    .order("number", { ascending: true });
  check("sessions read", error);
  return (data ?? []) as SessionRow[];
}

export async function createSession(
  pageId: string,
  input: SessionInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const admin = createAdminSupabase();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from("batch_sessions")
      .insert({
        page_id: pageId,
        number: input.number,
        title: input.title,
        starts_at: input.startsAt,
        zoom_url: input.zoomUrl,
        kahoot_url: input.kahootUrl,
        include_kahoot: input.includeKahoot,
        include_attendance_link: input.includeAttendanceLink,
        email_enabled: input.emailEnabled,
        email_lead_minutes: input.emailLeadMinutes,
        public_code: generateSessionCode(),
      })
      .select("id")
      .single();
    if (!error && data) return { ok: true, id: (data as { id: string }).id };
    if (isDuplicate(error)) {
      // A code collision is retried once with a fresh code; anything else is a duplicate number.
      if (/public_code/.test(error!.message) && attempt === 0) continue;
      if (/public_code/.test(error!.message)) return { ok: false, message: "Could not create the session. Please try again." };
      return { ok: false, message: DUP_NUMBER };
    }
    return { ok: false, message: "Could not create the session. Please try again." };
  }
  return { ok: false, message: "Could not create the session. Please try again." };
}

export async function updateSession(
  sessionId: string,
  input: Partial<SessionInput> & { windowOverride?: WindowOverride },
): Promise<{ ok: boolean; message?: string }> {
  const patch: TablesUpdate<"batch_sessions"> = {};
  if (input.number !== undefined) patch.number = input.number;
  if (input.title !== undefined) patch.title = input.title;
  if (input.startsAt !== undefined) patch.starts_at = input.startsAt;
  if (input.zoomUrl !== undefined) patch.zoom_url = input.zoomUrl;
  if (input.kahootUrl !== undefined) patch.kahoot_url = input.kahootUrl;
  if (input.includeKahoot !== undefined) patch.include_kahoot = input.includeKahoot;
  if (input.includeAttendanceLink !== undefined) patch.include_attendance_link = input.includeAttendanceLink;
  if (input.emailEnabled !== undefined) patch.email_enabled = input.emailEnabled;
  if (input.emailLeadMinutes !== undefined) patch.email_lead_minutes = input.emailLeadMinutes;
  if (input.windowOverride !== undefined) patch.window_override = input.windowOverride;
  if (Object.keys(patch).length === 0) return { ok: true };
  const { error } = await createAdminSupabase().from("batch_sessions").update(patch).eq("id", sessionId);
  if (isDuplicate(error)) return { ok: false, message: DUP_NUMBER };
  if (error) return { ok: false, message: "Could not save the session. Please try again." };
  return { ok: true };
}

/** Deletes the session; its marks go with it (on delete cascade). */
export async function deleteSession(sessionId: string): Promise<void> {
  const { error } = await createAdminSupabase().from("batch_sessions").delete().eq("id", sessionId);
  check("session delete", error);
}

export async function getSessionByCode(code: string): Promise<(SessionRow & { batchTitle: string }) | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("batch_sessions").select("*").eq("public_code", code).maybeSingle();
  check("session read", error);
  if (!data) return null;
  const session = data as SessionRow;
  const { data: page, error: pageErr } = await admin
    .from("landing_pages")
    .select("title")
    .eq("id", session.page_id)
    .maybeSingle();
  check("batch read", pageErr);
  return { ...session, batchTitle: (page as { title: string } | null)?.title ?? "" };
}

/**
 * Shared-link lookup. Returns the person and a first name only, never the email.
 * not_live means enrolled, but only as recorded.
 */
export async function eligiblePersonForEmail(
  pageId: string,
  email: string,
): Promise<{ personId: string; firstName: string } | { reason: "no_person" | "not_live" | "not_in_batch" }> {
  const admin = createAdminSupabase();
  const normalized = email.trim().toLowerCase();
  const { data: link, error } = await admin
    .from("pz_person_emails")
    .select("person_id")
    .eq("email", normalized)
    .maybeSingle();
  check("person lookup", error);
  const personId = (link as { person_id: string } | null)?.person_id;
  if (!personId) return { reason: "no_person" };

  const regs = await enrolledRegs(pageId, personId);
  if (regs.length === 0) return { reason: "not_in_batch" };
  if (!regs.some((r) => r.mode === "live")) return { reason: "not_live" };

  const { data: person, error: personErr } = await admin
    .from("pz_people")
    .select("display_name")
    .eq("id", personId)
    .maybeSingle();
  check("person read", personErr);
  const name = ((person as { display_name: string } | null)?.display_name ?? "").trim();
  return { personId, firstName: name.split(/\s+/)[0] ?? "" };
}

export async function isLiveEnrolled(pageId: string, personId: string): Promise<boolean> {
  return (await enrolledRegs(pageId, personId)).some((r) => r.mode === "live");
}

/** First name of a person, or null if they no longer exist (for example after a merge). */
export async function personFirstName(personId: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase()
    .from("pz_people")
    .select("display_name")
    .eq("id", personId)
    .maybeSingle();
  check("person read", error);
  if (!data) return null;
  return ((data as { display_name: string }).display_name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** Idempotent: the unique (session_id, person_id) key ignores a repeat, and only a new row is returned. */
export async function markPresent(
  sessionId: string,
  personId: string,
  source: "personal" | "shared" | "admin",
  markedBy?: string,
): Promise<{ created: boolean }> {
  const { data, error } = await createAdminSupabase()
    .from("batch_session_marks")
    .upsert(
      { session_id: sessionId, person_id: personId, source, marked_by: markedBy ?? null },
      { onConflict: "session_id,person_id", ignoreDuplicates: true },
    )
    .select("id");
  check("mark", error);
  return { created: (data ?? []).length > 0 };
}

export async function unmarkPresent(sessionId: string, personId: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("batch_session_marks")
    .delete()
    .eq("session_id", sessionId)
    .eq("person_id", personId);
  check("unmark", error);
}

/** Marks every live enrolled person of the batch who has no mark yet. Safe to repeat. */
export async function markAllPresent(sessionId: string, markedBy: string): Promise<{ added: number }> {
  const admin = createAdminSupabase();
  const { data: session, error: sErr } = await admin
    .from("batch_sessions")
    .select("page_id")
    .eq("id", sessionId)
    .maybeSingle();
  check("session read", sErr);
  if (!session) return { added: 0 };
  const people = await livePersonIds((session as { page_id: string }).page_id);

  const marked = new Set(
    (
      await fetchAll<{ person_id: string }>("marks read", () =>
        admin.from("batch_session_marks").select("person_id").eq("session_id", sessionId).order("id", { ascending: true }),
      )
    ).map((m) => m.person_id),
  );
  const missing = people.filter((p) => !marked.has(p));
  let added = 0;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const { data, error } = await admin
      .from("batch_session_marks")
      .upsert(
        missing.slice(i, i + CHUNK).map((person_id) => ({ session_id: sessionId, person_id, source: "admin" as const, marked_by: markedBy })),
        { onConflict: "session_id,person_id", ignoreDuplicates: true },
      )
      .select("id");
    check("mark all", error);
    added += (data ?? []).length;
  }
  return { added };
}

export async function getBatchGrid(
  pageId: string,
  now: Date = new Date(),
): Promise<{ sessions: SessionRow[]; rows: GridRow[]; minPct: number }> {
  const admin = createAdminSupabase();
  const sessions = await listSessions(pageId);
  const { data: page, error: pageErr } = await admin
    .from("landing_pages")
    .select("attendance_min_pct")
    .eq("id", pageId)
    .maybeSingle();
  check("batch read", pageErr);
  const minPct = (page as { attendance_min_pct: number } | null)?.attendance_min_pct ?? 75;

  const personIds = await livePersonIds(pageId);
  const people: { id: string; pz_id: string; display_name: string }[] = [];
  for (let i = 0; i < personIds.length; i += CHUNK) {
    const { data, error } = await admin
      .from("pz_people")
      .select("id, pz_id, display_name")
      .in("id", personIds.slice(i, i + CHUNK));
    check("people read", error);
    people.push(...((data ?? []) as typeof people));
  }

  const marksByPerson = new Map<string, Set<string>>();
  const sessionIds = sessions.map((s) => s.id);
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const part = sessionIds.slice(i, i + CHUNK);
    const marks = await fetchAll<{ session_id: string; person_id: string }>("marks read", () =>
      admin.from("batch_session_marks").select("session_id, person_id").in("session_id", part).order("id", { ascending: true }),
    );
    for (const m of marks) {
      const set = marksByPerson.get(m.person_id) ?? new Set<string>();
      set.add(m.session_id);
      marksByPerson.set(m.person_id, set);
    }
  }

  const startedIds = sessions.filter((s) => new Date(s.starts_at).getTime() <= now.getTime()).map((s) => s.id);
  const rows: GridRow[] = people.map((p) => {
    const has = marksByPerson.get(p.id) ?? new Set<string>();
    const marks: Record<string, boolean> = {};
    has.forEach((id) => { marks[id] = true; });
    const started = startedIds.length;
    const marked = startedIds.filter((id) => has.has(id)).length;
    const pct = attendancePercent(marked, started);
    return { personId: p.id, pzId: p.pz_id, name: p.display_name, marks, started, marked, pct, meetsMin: meetsMinimum(pct, minPct) };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { sessions, rows, minPct };
}

export async function setMinPct(pageId: string, pct: number): Promise<{ ok: boolean }> {
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { ok: false };
  const { error } = await createAdminSupabase().from("landing_pages").update({ attendance_min_pct: pct }).eq("id", pageId);
  return { ok: !error };
}
