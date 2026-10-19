import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Sent-once guard for registration emails. A sender claims (registration, kind) before sending
 * (state 'claimed'); a unique violation means it was already sent or is being sent. After a good
 * send it marks the row 'sent'; if the send fails it releases the claim so a retry can claim again.
 * portal_link emails are not guarded: each one is logged as its own 'sent' row and may repeat.
 */

export type EmailLogKind = "paid" | "underpaid" | "reserved" | "portal_link";

export interface EmailLogEntry { registrationId: string; kind: EmailLogKind; toEmail: string; sentAt: string }

/** True when this caller now owns the send; false when the email was already claimed. */
export async function claimEmail(registrationId: string, kind: EmailLogKind, toEmail: string): Promise<boolean> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .insert({ registration_id: registrationId, kind, to_email: toEmail, state: "claimed" });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

/** Marks a claimed email as sent. */
export async function markEmailSent(registrationId: string, kind: EmailLogKind): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .update({ state: "sent", sent_at: new Date().toISOString() })
    .eq("registration_id", registrationId)
    .eq("kind", kind)
    .eq("state", "claimed");
  if (error) throw error;
}

/** Records a portal link email that was sent. No guard: a person may get it more than once. */
export async function logPortalLink(registrationId: string, toEmail: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .insert({ registration_id: registrationId, kind: "portal_link", to_email: toEmail, state: "sent" });
  if (error) throw error;
}

/** Drops an unsent claim after a failed send so a retry can claim again. Never touches sent history. */
export async function releaseEmail(registrationId: string, kind: EmailLogKind): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .delete()
    .eq("registration_id", registrationId)
    .eq("kind", kind)
    .eq("state", "claimed");
  if (error) throw error;
}

/** Emails that actually went out (claimed-but-unsent rows are not listed). */
export async function listEmailLog(registrationIds: string[]): Promise<EmailLogEntry[]> {
  if (registrationIds.length === 0) return [];
  const { data, error } = await createAdminSupabase()
    .from("landing_email_log")
    .select("registration_id, kind, to_email, sent_at")
    .in("registration_id", registrationIds)
    .eq("state", "sent");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    registrationId: r.registration_id,
    kind: r.kind as EmailLogKind,
    toEmail: r.to_email,
    sentAt: r.sent_at,
  }));
}
