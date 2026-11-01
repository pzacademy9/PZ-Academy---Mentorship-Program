import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/pzid/format";
import { rowFromLabels, type IdRow } from "@/lib/pzid/id-list";

const PAGE = 1000;
const CHUNK = 200;
const MIN_QUERY = 3;
export const MAX_ROWS = 5;
/** Rows read from the database: one more than shown, so the page can say "more people match". */
export const FETCH_ROWS = MAX_ROWS + 1;
const ADMIN_ERROR = "Could not load IDs. Please try again.";

export type BatchIdRow = { name: string; pzId: string; emailMasked: string };

type EnrolledReg = { person_id: string | null; email: string; option_label?: string | null };
type Person = { id: string; pz_id: string; display_name: string };

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** All paid/free non-test registrations of a page that are linked to a person. */
async function loadEnrolled(pageId: string): Promise<EnrolledReg[] | null> {
  const supabase = createAdminSupabase();
  const out: EnrolledReg[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("landing_registrations")
      .select("person_id, email, option_label")
      .eq("page_id", pageId)
      .in("status", ["paid", "free"])
      .eq("is_test", false)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data) return null;
    for (const r of data as EnrolledReg[]) if (r.person_id) out.push(r);
    if (data.length < PAGE) break;
  }
  return out;
}

/** First registration email per person. */
function emailByPerson(regs: EnrolledReg[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of regs) if (r.person_id && !m.has(r.person_id)) m.set(r.person_id, r.email);
  return m;
}

/**
 * Public search of a batch's PZ IDs by name. Returns null when the slug is not a
 * published or closed landing page. Emails are returned masked only.
 */
export async function searchBatchIds(
  slug: string,
  query: string,
): Promise<{ found: boolean; rows: BatchIdRow[] } | null> {
  const supabase = createAdminSupabase();
  const { data: page, error: pageErr } = await supabase
    .from("landing_pages")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();
  if (pageErr) throw new Error("Could not search IDs. Please try again.");
  if (!page || (page.status !== "published" && page.status !== "closed")) return null;

  // PostgREST treats * in like/ilike values as %, so it is removed before anything else.
  const q = query.replace(/\*/g, "").trim();
  if (q.length < MIN_QUERY) return { found: false, rows: [] };

  const regs = await loadEnrolled(page.id);
  if (!regs) throw new Error("Could not search IDs. Please try again.");
  const emails = emailByPerson(regs);
  const ids = Array.from(emails.keys());

  const pattern = `%${escapeLike(q)}%`;
  const people: Person[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("pz_people")
      .select("id, pz_id, display_name")
      .in("id", ids.slice(i, i + CHUNK))
      .ilike("display_name", pattern);
    if (error) throw new Error("Could not search IDs. Please try again.");
    people.push(...((data ?? []) as Person[]));
  }

  const rows = people
    .sort((a, b) => a.display_name.localeCompare(b.display_name) || a.pz_id.localeCompare(b.pz_id))
    .slice(0, MAX_ROWS)
    .map((p) => ({ name: p.display_name, pzId: p.pz_id, emailMasked: maskEmail(emails.get(p.id) ?? "") }));
  return { found: rows.length > 0, rows };
}

export type MyIdRow = { firstName: string; pzId: string; batchTitle: string };

const FIND_ERROR = "Could not search IDs. Please try again.";
const MAX_QUERY = 60;


export type NameQueryCheck = { ok: true; q: string } | { ok: false; reason: "too_short" | "too_long" };

/**
 * Cleans a public name query: removes *, trims, collapses inner whitespace. Says why it is rejected:
 * too short (under 3 characters or under 3 letters/digits) or too long (over 60 characters).
 */
export function checkNameQuery(query: unknown): NameQueryCheck {
  if (typeof query !== "string") return { ok: false, reason: "too_short" };
  const q = query.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (q.length > MAX_QUERY) return { ok: false, reason: "too_long" };
  if (q.length < MIN_QUERY) return { ok: false, reason: "too_short" };
  if (Array.from(q).filter((c) => /[0-9]/.test(c) || c.toLowerCase() !== c.toUpperCase()).length < MIN_QUERY) {
    return { ok: false, reason: "too_short" };
  }
  return { ok: true, q };
}

/** The cleaned query, or null when it is too short or too long. */
export function cleanNameQuery(query: unknown): string | null {
  const c = checkNameQuery(query);
  return c.ok ? c.q : null;
}

/**
 * Public "find my ID" search for the progress page. The query is cleaned first (3-60 characters),
 * then ONE database function does the whole search (enrolled people of published or closed batches
 * only) and returns at most 6 rows (callers show 5 and use the 6th as a "more" signal): first name, PZ ID and batch title. It never returns an email,
 * last name or full name, so it cannot be used to list everyone. Throws a plain error on a database failure.
 */
export async function findIdsByName(query: string): Promise<MyIdRow[]> {
  const q = cleanNameQuery(query);
  if (!q) return [];
  const { data, error } = await createAdminSupabase().rpc("find_enrolled_ids_by_name", { p_query: q });
  if (error || !Array.isArray(data)) throw new Error(FIND_ERROR);
  return data.slice(0, FETCH_ROWS).map((r) => ({
    firstName: r.first_name,
    pzId: r.pz_id,
    batchTitle: r.batch_title,
  }));
}

/** Admin-only list of every enrolled person of a batch (raw email; the caller guards). */
export async function listBatchIdsForAdmin(
  pageId: string,
): Promise<Array<{ name: string; email: string; pzId: string }>> {
  const regs = await loadEnrolled(pageId);
  if (!regs) throw new Error(ADMIN_ERROR);
  const emails = emailByPerson(regs);
  const ids = Array.from(emails.keys());
  const supabase = createAdminSupabase();
  const out: Array<{ name: string; email: string; pzId: string }> = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("pz_people")
      .select("id, pz_id, display_name")
      .in("id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(ADMIN_ERROR);
    for (const p of (data ?? []) as Person[]) {
      out.push({ name: p.display_name, email: emails.get(p.id) ?? "", pzId: p.pz_id });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Admin-only list for the Student IDs page: one row per enrolled person with their course scope
 * (from every registration option label). Never returns an email or phone; the caller guards.
 */
export async function listBatchIdRowsWithScope(pageId: string): Promise<IdRow[]> {
  const regs = await loadEnrolled(pageId);
  if (!regs) throw new Error(ADMIN_ERROR);
  const labels = new Map<string, string[]>();
  for (const r of regs) {
    if (!r.person_id) continue;
    const list = labels.get(r.person_id) ?? [];
    if (r.option_label) list.push(r.option_label);
    labels.set(r.person_id, list);
  }
  const ids = Array.from(labels.keys());
  const supabase = createAdminSupabase();
  const out: IdRow[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("pz_people")
      .select("id, pz_id, display_name")
      .in("id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(ADMIN_ERROR);
    for (const p of (data ?? []) as Person[]) out.push(rowFromLabels(p.display_name, p.pz_id, labels.get(p.id) ?? []));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Title of a published or closed landing page, for the public find-your-ID heading. */
export async function getBatchTitle(slug: string): Promise<string | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("landing_pages")
    .select("title, status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("Could not load this page. Please try again.");
  if (!data || (data.status !== "published" && data.status !== "closed")) return null;
  return data.title as string;
}
