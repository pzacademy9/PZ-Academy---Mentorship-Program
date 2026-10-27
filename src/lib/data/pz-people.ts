import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/pzid/format";

const PAGE = 1000;
const CHUNK = 200;
const MIN_QUERY = 3;
const MAX_ROWS = 5;
const ADMIN_ERROR = "Could not load IDs. Please try again.";

export type BatchIdRow = { name: string; pzId: string; emailMasked: string };

type EnrolledReg = { person_id: string | null; email: string };
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
      .select("person_id, email")
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

  const q = query.trim();
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
