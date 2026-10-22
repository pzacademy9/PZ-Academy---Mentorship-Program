import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Once-per-registration guard for the Meta Purchase event. The registration id is the primary key,
 * so a second claim is a unique violation: the Purchase fires once per registration, ever.
 * A sender claims before calling Meta, marks 'sent' after a good send, and releases the claim if
 * Meta fails so the job retry can claim again. 'skipped_old' is final.
 */

export type MetaPurchaseState = "claimed" | "sent" | "skipped_old";

/** A claim older than this is treated as abandoned by a crashed worker and may be taken over. */
export const STALE_CLAIM_MINUTES = 15;

/**
 * True when this caller now owns the send; false when a row already exists (fresh claim, sent or
 * skipped). A stale claim (crash between claim and send) is taken over: Meta de-duplicates on the
 * stable event_id, so a re-send is harmless.
 */
export async function claimMetaPurchase(registrationId: string, eventId: string): Promise<boolean> {
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("landing_meta_events")
    .insert({ registration_id: registrationId, event_id: eventId, state: "claimed" });
  if (!error) return true;
  if (error.code !== "23505") throw error;
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { data, error: takeErr } = await admin
    .from("landing_meta_events")
    .update({ created_at: new Date().toISOString() })
    .eq("registration_id", registrationId)
    .eq("state", "claimed")
    .lt("created_at", cutoff)
    .select("registration_id");
  if (takeErr) throw takeErr;
  return (data ?? []).length === 1;
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
