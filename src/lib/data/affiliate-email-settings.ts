// src/lib/data/affiliate-email-settings.ts
// Server-only: the one message box shown in the affiliate Accepted and Progress emails.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const MESSAGE_MAX = 1000;

/** The saved message, or "" if the row is missing or the read fails. Never throws. */
export async function getEmailMessage(): Promise<string> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.from("affiliate_email_settings").select("message").maybeSingle();
    if (error || !data) return "";
    return typeof data.message === "string" ? data.message : "";
  } catch {
    return "";
  }
}

export async function setEmailMessage(message: string): Promise<void> {
  const text = message.trim();
  if (text.length > MESSAGE_MAX) throw new Error(`The message is longer than ${MESSAGE_MAX} characters.`);
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("affiliate_email_settings")
    .upsert({ id: true, message: text, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}
