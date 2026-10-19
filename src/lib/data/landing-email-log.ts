import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Sent-once guard for registration emails. A sender claims (registration, kind) before sending;
 * a unique violation means it was already sent or is being sent. If the send fails the sender
 * releases the claim so a retry can claim again.
 */

export type EmailLogKind = "paid" | "underpaid" | "reserved" | "portal_link";

export interface EmailLogEntry { registrationId: string; kind: EmailLogKind; toEmail: string; sentAt: string }

/** True when this caller now owns the send; false when the email was already claimed. */
export async function claimEmail(registrationId: string, kind: EmailLogKind, toEmail: string): Promise<boolean> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .insert({ registration_id: registrationId, kind, to_email: toEmail });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

/** Drops the claim after a failed send so a retry can claim again. */
export async function releaseEmail(registrationId: string, kind: EmailLogKind): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .delete()
    .eq("registration_id", registrationId)
    .eq("kind", kind);
  if (error) throw error;
}

export async function listEmailLog(registrationIds: string[]): Promise<EmailLogEntry[]> {
  if (registrationIds.length === 0) return [];
  const { data, error } = await createAdminSupabase()
    .from("landing_email_log")
    .select("registration_id, kind, to_email, sent_at")
    .in("registration_id", registrationIds);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    registrationId: r.registration_id,
    kind: r.kind as EmailLogKind,
    toEmail: r.to_email,
    sentAt: r.sent_at,
  }));
}
