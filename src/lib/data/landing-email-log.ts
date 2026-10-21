import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Sent-once guard for registration emails. A sender claims (registration, kind) before sending
 * (state 'claimed'); a unique violation means it was already sent or is being sent. After a good
 * send it marks the row 'sent'; if the send fails it releases the claim so a retry can claim again.
 * portal_link emails are not guarded: each one is logged as its own 'sent' row and may repeat.
 */

export type EmailLogKind = "paid" | "underpaid" | "reserved" | "portal_link" | "manual_received" | "manual_paid" | "manual_underpaid" | "manual_reserved";

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

type ManualLogKind = "manual_received" | "manual_paid" | "manual_underpaid" | "manual_reserved";

/**
 * Records an admin "send again" that went out. The table is keyed (registration_id, kind), so a second
 * send of the same kind replaces the row (state 'sent', new time and address) instead of conflicting.
 */
export async function logManualEmail(registrationId: string, kind: ManualLogKind, toEmail: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_email_log")
    .upsert(
      { registration_id: registrationId, kind, to_email: toEmail, state: "sent", sent_at: new Date().toISOString() },
      { onConflict: "registration_id,kind" },
    );
  if (error) throw error;
}

const AUTOMATIC_TWIN: Partial<Record<EmailLogKind, EmailLogKind>> = {
  paid: "manual_paid", manual_paid: "paid",
  underpaid: "manual_underpaid", manual_underpaid: "underpaid",
  reserved: "manual_reserved", manual_reserved: "reserved",
};

/** Latest time any of these kinds (or its automatic/manual twin) actually went out, or null. */
export async function lastSentAt(registrationId: string, kinds: EmailLogKind[]): Promise<string | null> {
  const all = Array.from(new Set(kinds.flatMap((k) => (AUTOMATIC_TWIN[k] ? [k, AUTOMATIC_TWIN[k] as EmailLogKind] : [k]))));
  if (all.length === 0) return null;
  const { data, error } = await createAdminSupabase()
    .from("landing_email_log")
    .select("sent_at")
    .eq("registration_id", registrationId)
    .eq("state", "sent")
    .in("kind", all)
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.sent_at as string | undefined) ?? null;
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

/**
 * Releases claims older than `olderThanMinutes` (a worker died between claim and send). Deletes only
 * rows that are still 'claimed' and were selected here, so a row that just became 'sent' is never dropped.
 * Returns the affected registration ids so the caller can re-enqueue their email_status job (done in
 * landing-jobs: importing it here would be an import cycle).
 * Accepted tradeoff: a claim this old may belong to an email that WAS sent but whose markEmailSent
 * failed; releasing it can send one duplicate. A lost email is worse than a duplicate.
 */
export async function sweepStaleClaims(olderThanMinutes = 15): Promise<{ released: number; registrationIds: string[] }> {
  const admin = createAdminSupabase();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data: stale, error } = await admin
    .from("landing_email_log")
    .select("id, registration_id")
    .eq("state", "claimed")
    .lt("claimed_at", cutoff)
    .limit(200); // the rest are picked up by the next drain
  if (error) throw error;
  const ids = (stale ?? []).map((r) => r.id as string);
  if (ids.length === 0) return { released: 0, registrationIds: [] };
  const { data: deleted, error: delErr } = await admin
    .from("landing_email_log")
    .delete()
    .in("id", ids)
    .eq("state", "claimed")
    .select("registration_id");
  if (delErr) throw delErr;
  const registrationIds = Array.from(new Set((deleted ?? []).map((r) => r.registration_id as string)));
  return { released: (deleted ?? []).length, registrationIds };
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
