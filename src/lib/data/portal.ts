// src/lib/data/portal.ts
// Server-only loaders for the public batch portal. They read the database and hand plain rows to the
// pure builders in portal-build.ts. No email is ever selected for the batch views.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { audienceFromJson } from "@/lib/classes/audience";
import { normalizeContent } from "@/lib/landing/content";
import { isSafeUrl } from "@/lib/landing/simple-text";
import { fetchAll } from "@/lib/data/attendance";
import { getProgressByPzId } from "@/lib/data/progress";
import { isPortalVisible } from "@/lib/progress/visibility";
import type { Progress, ProgressKind } from "@/lib/progress/build";
import {
  buildPortalBatch,
  buildPortalCards,
  type PortalBatchCard,
  type PortalBatchInput,
  type PortalBatchView,
  type PortalPersonInput,
  type PortalRegInput,
  type PortalSessionInput,
} from "@/lib/progress/portal-build";

const CHUNK = 200;
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

type PageRow = { id: string; title: string; slug: string; status: string; kind: string; attendance_min_pct: number; published: unknown; class_cover_url: string | null; show_in_portal: boolean; course_id: string | null };
type SessionRow = { id: string; page_id: string; number: number; title: string; starts_at: string; audience: unknown; quiz_max_score: number | null };
type RegRow = { page_id: string; person_id: string | null; mode: string; option_label: string };

const safeHttp = (v: unknown): string | null =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim()) && isSafeUrl(v) ? v.trim() : null;

/** One cover URL: hero picture (computer, then phone), then the social image, then the class cover. Never the whole content. */
function pickCover(p: PageRow): string | null {
  if (p.published !== null && p.published !== undefined) {
    const content = normalizeContent(p.published);
    const hero = content.sections.find((s) => s.type === "hero");
    const found = safeHttp(hero?.data.imagePc) ?? safeHttp(hero?.data.imagePhone) ?? safeHttp(content.seo.ogImage);
    if (found) return found;
  }
  return safeHttp(p.class_cover_url);
}

/** Batches of a portal kind with the switch on, optionally just one slug. Draft batches are kept here; loadInputs drops the ones with no students. */
async function readPages(slug?: string): Promise<PageRow[]> {
  let q = createAdminSupabase()
    .from("landing_pages")
    .select("id, title, slug, status, kind, attendance_min_pct, published, class_cover_url, show_in_portal, course_id")
    .eq("show_in_portal", true)
    .in("kind", KINDS);
  if (slug !== undefined) q = q.eq("slug", slug);
  const { data, error } = await q;
  check("batches read", error);
  return ((data ?? []) as PageRow[]).filter((p) => KINDS.includes(p.kind));
}

async function loadInputs(candidates: PageRow[], withResults: boolean, now: Date): Promise<PortalBatchInput[]> {
  if (candidates.length === 0) return [];
  const admin = createAdminSupabase();

  const regs: RegRow[] = [];
  for (const part of chunks(candidates.map((p) => p.id))) {
    // Only paid or free, non-test registrations count: the builders cannot see payment status.
    regs.push(
      ...(await fetchAll<RegRow>("registrations read", () =>
        admin
          .from("landing_registrations")
          .select("page_id, person_id, mode, option_label")
          .in("page_id", part)
          .in("status", ["paid", "free"])
          .eq("is_test", false)
          .order("id", { ascending: true }),
      )),
    );
  }

  // One visibility rule everywhere: a draft batch is shown only once it has enrolled students.
  const enrolledPages = new Set(regs.map((r) => r.page_id));
  const pages = candidates.filter((p) =>
    isPortalVisible({ status: p.status, showInPortal: p.show_in_portal, kind: p.kind, enrolled: enrolledPages.has(p.id) }),
  );
  if (pages.length === 0) return [];
  const pageIds = pages.map((p) => p.id);

  // Course titles for the home page grouping, in one query.
  const courseIds = Array.from(new Set(pages.map((p) => p.course_id).filter((id): id is string => !!id)));
  const courseTitles = new Map<string, string>();
  for (const part of chunks(courseIds)) {
    const rows = await fetchAll<{ id: string; title: string }>("courses read", () =>
      admin.from("courses").select("id, title").in("id", part).order("id", { ascending: true }),
    );
    for (const c of rows) courseTitles.set(c.id, c.title);
  }

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

  const personIds = Array.from(new Set(regs.map((r) => r.person_id).filter((id): id is string => !!id)));
  const people = new Map<string, PortalPersonInput>();
  for (const part of chunks(personIds)) {
    const rows = await fetchAll<{ id: string; pz_id: string; display_name: string }>("people read", () =>
      admin.from("pz_people").select("id, pz_id, display_name").in("id", part).order("id", { ascending: true }),
    );
    for (const p of rows) {
      if ((p.display_name ?? "").trim().length === 0) continue; // blank name: nothing safe to show
      people.set(p.id, { id: p.id, pzId: p.pz_id, displayName: p.display_name });
    }
  }

  const sessionIds = sessions.map((s) => s.id);
  const marks: { session_id: string; person_id: string; source: string }[] = [];
  const scores: { session_id: string; person_id: string; score: number }[] = [];
  if (withResults) {
    for (const part of chunks(sessionIds)) {
      marks.push(
        ...(await fetchAll<{ session_id: string; person_id: string; source: string }>("marks read", () =>
          admin.from("batch_session_marks").select("session_id, person_id, source").in("session_id", part).order("id", { ascending: true }),
        )),
      );
      scores.push(
        ...(await fetchAll<{ session_id: string; person_id: string; score: number }>("quiz results read", () =>
          admin.from("batch_quiz_results").select("session_id, person_id, score").in("session_id", part).order("id", { ascending: true }),
        )),
      );
    }
  }

  return pages.map((p) => {
    const sessionInputs: PortalSessionInput[] = [];
    for (const s of sessions.filter((x) => x.page_id === p.id)) {
      const audience = s.audience === null || s.audience === undefined ? null : audienceFromJson(s.audience);
      // A stored audience that cannot be read is never trusted: the class is left out.
      if (s.audience !== null && s.audience !== undefined && audience === null) continue;
      sessionInputs.push({ id: s.id, number: s.number, title: s.title, startsAt: s.starts_at, audience, quizMax: s.quiz_max_score });
    }
    const keep = new Set(sessionInputs.map((s) => s.id));
    const pageRegs: PortalRegInput[] = [];
    const pagePeople = new Map<string, PortalPersonInput>();
    for (const r of regs) {
      if (r.page_id !== p.id || !r.person_id) continue;
      const person = people.get(r.person_id);
      if (!person) continue;
      pagePeople.set(person.id, person);
      pageRegs.push({ personId: r.person_id, mode: r.mode === "live" ? "live" : "recorded", optionLabel: r.option_label });
    }
    return {
      pageId: p.id,
      title: p.title,
      slug: p.slug,
      kind: p.kind as ProgressKind,
      minPct: p.attendance_min_pct,
      closed: p.status === "closed",
      coverUrl: pickCover(p),
      courseId: p.course_id,
      courseTitle: p.course_id ? (courseTitles.get(p.course_id) ?? null) : null,
      sessions: sessionInputs,
      people: Array.from(pagePeople.values()),
      regs: pageRegs,
      marks: marks.filter((m) => keep.has(m.session_id)).map((m) => ({ sessionId: m.session_id, personId: m.person_id, how: m.source === "admin" ? ("admin" as const) : ("check-in" as const) })),
      scores: scores.filter((s) => keep.has(s.session_id)).map((s) => ({ sessionId: s.session_id, personId: s.person_id, score: s.score })),
      now,
    };
  });
}

/** Cards for every visible batch (see isPortalVisible). A failed read throws; never a partial list. */
export async function listPortalBatches(now: Date = new Date()): Promise<PortalBatchCard[]> {
  return buildPortalCards(await loadInputs(await readPages(), false, now));
}

/** One batch's public lists, or null for an unknown slug, a hidden batch (switch off, empty draft), or the wrong kind. */
export async function getPortalBatch(slug: string, now: Date = new Date()): Promise<PortalBatchView | null> {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 200) return null;
  const pages = await readPages(slug);
  if (pages.length === 0) return null;
  const [input] = await loadInputs(pages.slice(0, 1), true, now);
  if (!input) return null; // hidden: empty draft
  return buildPortalBatch(input);
}

/** Progress of the person who owns this email (case-insensitive), or null when there is no such person. */
async function getProgressForEmail(email: string, now: Date = new Date()): Promise<Progress | null> {
  const normalized = (typeof email === "string" ? email : "").trim().toLowerCase();
  if (normalized.length === 0) return null;
  const admin = createAdminSupabase();
  const { data: link, error } = await admin.from("pz_person_emails").select("person_id").eq("email", normalized).maybeSingle();
  check("person lookup", error);
  const personId = (link as { person_id: string } | null)?.person_id;
  if (!personId) return null;
  const { data: person, error: pErr } = await admin.from("pz_people").select("pz_id").eq("id", personId).maybeSingle();
  check("person read", pErr);
  const pzId = (person as { pz_id: string } | null)?.pz_id;
  return pzId ? getProgressByPzId(pzId, now) : null;
}

export type ProgressForUser = { status: "unconfirmed" } | { status: "ok"; progress: Progress | null };

/**
 * Progress for a signed-in user. Same identity rule as the certificates page: the email must exist
 * AND be confirmed, otherwise nothing is loaded (an unconfirmed address proves nothing).
 */
export async function getProgressForUser(
  user: { email?: string | null; email_confirmed_at?: string | null },
  now: Date = new Date(),
): Promise<ProgressForUser> {
  if (!user.email || !user.email_confirmed_at) return { status: "unconfirmed" };
  return { status: "ok", progress: await getProgressForEmail(user.email, now) };
}
