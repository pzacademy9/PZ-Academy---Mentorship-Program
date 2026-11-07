// src/lib/data/site-terms.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

import type { TermsKey } from "@/lib/validations/site-terms";

export type TermsDoc = { body: string; updatedAt: string | null };

/** One Terms document and when it was last saved; empty when none is saved. Throws on a database error. */
export async function getTerms(key: TermsKey): Promise<TermsDoc> {
  // Affiliate documents are read fresh so a saved text shows at once and the apply form opens when all three are in.
  // The general Terms keep the cached client: the landing pages are cached on purpose.
  const db = key === "general" ? createAdminSupabase() : createAdminSupabase({ noStore: true });
  const { data, error } = await db.from("site_terms").select("body, updated_at").eq("key", key).maybeSingle();
  if (error) throw error;
  return {
    body: typeof data?.body === "string" ? data.body : "",
    updatedAt: typeof data?.updated_at === "string" ? data.updated_at : null,
  };
}

/** For public pages: a missing table (the SQL not pasted yet) means "no document", never a broken page. */
export async function getTermsOrEmpty(key: TermsKey): Promise<TermsDoc> {
  try {
    return await getTerms(key);
  } catch (e) {
    const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
    if (code === "PGRST205" || code === "42P01") return { body: "", updatedAt: null };
    throw e;
  }
}

/** Saves one Terms document. Throws on a database error. */
export async function saveTerms(key: TermsKey, body: string): Promise<void> {
  const { error } = await createAdminSupabase().from("site_terms").upsert({ key, body, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

/** The general Terms and Conditions text; "" when none is saved. Throws on a database error. */
export async function getGeneralTerms(): Promise<string> {
  return (await getTerms("general")).body;
}

/**
 * The three affiliate documents. `ready` is true only when all three have text.
 * `version` joins the three saved-at stamps: it is what an applicant agreed to.
 */
export async function getAffiliatePolicies(): Promise<{
  terms: TermsDoc;
  rules: TermsDoc;
  privacy: TermsDoc;
  ready: boolean;
  version: string;
}> {
  const [terms, rules, privacy] = await Promise.all([getTerms("affiliate_terms"), getTerms("affiliate_rules"), getTerms("affiliate_privacy")]);
  const docs = [terms, rules, privacy];
  const ready = docs.every((d) => d.body.trim() !== "" && d.updatedAt !== null);
  return { terms, rules, privacy, ready, version: docs.map((d) => d.updatedAt ?? "").join("|") };
}

/** For public pages: a missing table (the SQL not pasted yet) means "no general Terms", never a broken page. */
export async function getGeneralTermsOrEmpty(): Promise<string> {
  try {
    return await getGeneralTerms();
  } catch (e) {
    // Only "the table is not there yet" means no Terms. Any other failure is thrown so a cached page keeps its last good version.
    const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
    if (code === "PGRST205" || code === "42P01") return "";
    throw e;
  }
}

/** Saves the general Terms and Conditions text. Throws on a database error. */
export async function saveGeneralTerms(body: string): Promise<void> {
  await saveTerms("general", body);
}
