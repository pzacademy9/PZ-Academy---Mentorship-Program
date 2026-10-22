import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Once-per-registration guard for the Meta Purchase event. The registration id is the primary key,
 * so a second claim is a unique violation: the Purchase fires once per registration, ever.
 * A sender claims before calling Meta, marks 'sent' after a good send, and releases the claim if
 * Meta fails so the job retry can claim again. 'skipped_old' is final.
 */

export type MetaPurchaseState = "claimed" | "sent" | "skipped_old";

/** True when this caller now owns the send; false when a row already exists (claimed, sent or skipped). */
export async function claimMetaPurchase(registrationId: string, eventId: string): Promise<boolean> {
  const { error } = await createAdminSupabase()
    .from("landing_meta_events")
    .insert({ registration_id: registrationId, event_id: eventId, state: "claimed" });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

/** Marks a claimed Purchase as sent, recording what was sent. */
export async function markMetaPurchaseSent(registrationId: string, p: { value: number; currency: string }): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_meta_events")
    .update({ state: "sent", value: p.value, currency: p.currency, sent_at: new Date().toISOString() })
    .eq("registration_id", registrationId)
    .eq("state", "claimed");
  if (error) throw error;
}

/** Final: the first Paid is too old to send. Recorded so nothing retries. */
export async function markMetaPurchaseSkipped(registrationId: string, reason: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_meta_events")
    .update({ state: "skipped_old", detail: reason })
    .eq("registration_id", registrationId)
    .eq("state", "claimed");
  if (error) throw error;
}

/** Drops an unsent claim after a failed send so a retry can claim again. Never touches sent or skipped rows. */
export async function releaseMetaPurchase(registrationId: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from("landing_meta_events")
    .delete()
    .eq("registration_id", registrationId)
    .eq("state", "claimed");
  if (error) throw error;
}

export async function getMetaPurchase(
  registrationId: string,
): Promise<{ state: MetaPurchaseState; sentAt: string | null; detail: string } | null> {
  const { data, error } = await createAdminSupabase()
    .from("landing_meta_events")
    .select("state, sent_at, detail")
    .eq("registration_id", registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { state: data.state as MetaPurchaseState, sentAt: data.sent_at, detail: data.detail };
}

/** Time of the earliest transition to 'paid' for this registration, or null if it never was. */
export async function firstPaidAt(registrationId: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase()
    .from("landing_status_events")
    .select("at")
    .eq("registration_id", registrationId)
    .eq("to_status", "paid")
    .order("at", { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.at as string | undefined) ?? null;
}
