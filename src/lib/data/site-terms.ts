// src/lib/data/site-terms.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const KEY = "general";

/** The general Terms and Conditions text; "" when none is saved. Throws on a database error. */
export async function getGeneralTerms(): Promise<string> {
  const { data, error } = await createAdminSupabase().from("site_terms").select("body").eq("key", KEY).maybeSingle();
  if (error) throw error;
  return typeof data?.body === "string" ? data.body : "";
}

/** Saves the general Terms and Conditions text. Throws on a database error. */
export async function saveGeneralTerms(body: string): Promise<void> {
  const { error } = await createAdminSupabase().from("site_terms").upsert({ key: KEY, body, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}
