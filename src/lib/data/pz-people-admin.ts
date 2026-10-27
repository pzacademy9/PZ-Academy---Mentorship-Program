import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizePzId } from "@/lib/pzid/format";

const MIN_QUERY = 3;
const MAX_RESULTS = 20;
// Per-source cap while collecting matches, so ranking and the "more than 20" check see the real set.
const SOURCE_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIND_ERROR = "Could not search people. Please try again.";

export type PersonResult = { id: string; pzId: string; name: string; emails: string[]; batches: number };
export type FindPeopleResult = { people: PersonResult[]; truncated: boolean };

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Admin-only lookup of people by PZ ID, old ID (alias), email or name.
 * Needs at least 3 characters; returns at most 20 people, exact PZ ID or alias matches first, then by
 * name. `truncated` is true when more than 20 people matched. The caller guards access.
 */
export async function findPeople(query: string): Promise<FindPeopleResult> {
  const q = query.trim();
  if (q.length < MIN_QUERY) return { people: [], truncated: false };

  const supabase = createAdminSupabase();
  const byText = `%${escapeLike(q.toLowerCase())}%`;
  const byId = `%${escapeLike(normalizePzId(q))}%`;

  const exactNorm = normalizePzId(q);
  const [aliases, emails, names, exactAliases] = await Promise.all([
    supabase.from("pz_id_aliases").select("person_id").ilike("alias_norm", byId).limit(SOURCE_LIMIT),
    supabase.from("pz_person_emails").select("person_id").ilike("email", byText).limit(SOURCE_LIMIT),
    supabase.from("pz_people").select("id").ilike("display_name", byText).limit(SOURCE_LIMIT),
    supabase.from("pz_id_aliases").select("person_id").eq("alias_norm", exactNorm),
  ]);
  if (aliases.error || emails.error || names.error || exactAliases.error) throw new Error(FIND_ERROR);

  const ids = new Set<string>();
  for (const r of (aliases.data ?? []) as Array<{ person_id: string }>) ids.add(r.person_id);
  for (const r of (emails.data ?? []) as Array<{ person_id: string }>) ids.add(r.person_id);
  for (const r of (names.data ?? []) as Array<{ id: string }>) ids.add(r.id);
  const exactIds = new Set<string>();
  for (const r of (exactAliases.data ?? []) as Array<{ person_id: string }>) {
    exactIds.add(r.person_id);
    ids.add(r.person_id);
  }
  const personIds = Array.from(ids);
  if (personIds.length === 0) return { people: [], truncated: false };

  const [people, personEmails, regs] = await Promise.all([
    supabase.from("pz_people").select("id, pz_id, display_name").in("id", personIds),
    supabase.from("pz_person_emails").select("email, person_id").in("person_id", personIds),
    supabase
      .from("landing_registrations")
      .select("person_id")
      .in("person_id", personIds)
      .in("status", ["paid", "free"])
      .eq("is_test", false),
  ]);
  if (people.error || personEmails.error || regs.error) throw new Error(FIND_ERROR);

  const ranked = ((people.data ?? []) as Array<{ id: string; pz_id: string; display_name: string }>)
    .map((p) => ({ ...p, exact: exactIds.has(p.id) || normalizePzId(p.pz_id) === exactNorm }))
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.display_name.localeCompare(b.display_name) ||
        a.pz_id.localeCompare(b.pz_id),
    );
  const truncated = ranked.length > MAX_RESULTS;
  const top = ranked.slice(0, MAX_RESULTS);

  const emailsOf = new Map<string, string[]>();
  for (const e of (personEmails.data ?? []) as Array<{ email: string; person_id: string }>) {
    emailsOf.set(e.person_id, [...(emailsOf.get(e.person_id) ?? []), e.email]);
  }
  const batchesOf = new Map<string, number>();
  for (const r of (regs.data ?? []) as Array<{ person_id: string | null }>) {
    if (r.person_id) batchesOf.set(r.person_id, (batchesOf.get(r.person_id) ?? 0) + 1);
  }

  return {
    people: top.map((p) => ({
      id: p.id,
      pzId: p.pz_id,
      name: p.display_name,
      emails: (emailsOf.get(p.id) ?? []).sort(),
      batches: batchesOf.get(p.id) ?? 0,
    })),
    truncated,
  };
}

/** Folds the "drop" person into the "keep" person. The dropped PZ ID keeps working as an alias. */
export async function mergePeople(
  keepId: string,
  dropId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!UUID.test(keepId) || !UUID.test(dropId)) {
    return { ok: false, message: "Pick two people from the list." };
  }
  if (keepId.toLowerCase() === dropId.toLowerCase()) {
    return { ok: false, message: "Pick two different people." };
  }
  const supabase = createAdminSupabase();
  const { error } = await supabase.rpc("pz_merge_people", { p_keep: keepId, p_drop: dropId });
  if (error) return { ok: false, message: "Could not merge these people. Nothing was changed. Please try again." };
  return { ok: true };
}
