import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Unsubscribe by opaque token. No authentication: the recipient of a bulk
 * email has no account and must not need one to opt out. The token is a
 * random uuid per contact and grants nothing except the ability to
 * unsubscribe that one contact.
 */
export async function unsubscribeByToken(token: string): Promise<"ok" | "already" | "not-found"> {
  const admin = createAdminSupabase();

  const { data } = await admin
    .from("contacts")
    .select("id, email_unsubscribed_at")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (!data) return "not-found";
  if (data.email_unsubscribed_at !== null) return "already";

  const { error } = await admin
    .from("contacts")
    .update({ email_unsubscribed_at: new Date().toISOString() })
    .eq("id", data.id);

  return error ? "not-found" : "ok";
}
