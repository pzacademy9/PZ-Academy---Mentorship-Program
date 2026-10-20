import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

const TABLE = "participant_email_prefs";

/** Returns the unsubscribe token for an email, creating the row on first use. */
export async function getOrCreateToken(email: string): Promise<string> {
  const admin = createAdminSupabase();
  const key = email.trim().toLowerCase();
  const { error: upErr } = await admin.from(TABLE).upsert({ email: key }, { onConflict: "email", ignoreDuplicates: true });
  if (upErr) throw new Error(upErr.message);
  const { data, error } = await admin.from(TABLE).select("token").eq("email", key).single();
  if (error || !data) throw new Error(error?.message ?? "Token not found");
  return data.token;
}

/** Lowercase emails (from the given list) that have opted out. */
export async function listUnsubscribed(emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const keys = Array.from(new Set(emails.map((e) => e.trim().toLowerCase())));
  if (keys.length === 0) return out;
  const admin = createAdminSupabase();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await admin
      .from(TABLE)
      .select("email, unsubscribed_at")
      .in("email", keys.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.unsubscribed_at !== null) out.add(r.email);
  }
  return out;
}

/** Unsubscribe by opaque token. No authentication: the token only opts out its own address. */
export async function unsubscribeParticipantByToken(token: string): Promise<"ok" | "already" | "not-found"> {
  const admin = createAdminSupabase();
  const { data } = await admin.from(TABLE).select("email, unsubscribed_at").eq("token", token).maybeSingle();
  if (!data) return "not-found";
  if (data.unsubscribed_at !== null) return "already";
  const { error } = await admin.from(TABLE).update({ unsubscribed_at: new Date().toISOString() }).eq("email", data.email);
  return error ? "not-found" : "ok";
}
