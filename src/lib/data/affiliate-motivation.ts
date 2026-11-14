// src/lib/data/affiliate-motivation.ts
// The Motivation email: the owner sends it from Admin, Affiliates to accepted affiliates with no paid sale yet.
//
// Exactly-once rule: each person is CLAIMED (motivation_emailed_at set, only where it still holds the value we read)
// before the send. A lost claim means another call has them: no email. On a failed send the old value is put back
// (null for a first send), so a failure never counts as sent.
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAffiliateBoard, type AffiliateBoard } from "@/lib/data/affiliate-leaderboard";
import { countSentLast24h } from "@/lib/data/affiliate-emails";
import { sendMotivation } from "@/lib/affiliates/send";
import { recordMotivationSend } from "@/lib/data/affiliate-motivation-sends";
import { affiliateSupportWa } from "@/lib/affiliates/contact";
import { motivationEmail, type MotivationInput, type TopRow } from "@/lib/affiliates/rich-emails";

/** Motivation stops here so the automatic Progress emails always keep room under Brevo's 300 a day. */
export const MOTIVATION_DAILY_LIMIT = 250;
export const MOTIVATION_MAX_IDS = 25;
const TOP_N = 5;

export type MotivationCandidate = { id: string; name: string; email: string | null; sentAt: string | null };
export type MotivationBatchResult = { sent: number; failed: number; skipped: number; limitReached: boolean; remainingToday: number };

type AffiliateRow = { id: string; name: string; code: string | null; email: string | null; status: string; motivation_emailed_at: string | null };

/** All-time paid count per affiliate. The board lists every accepted affiliate; a missing one has no sale. */
const paidOf = (board: AffiliateBoard, id: string): number => board.rows.find((r) => r.affiliateId === id)?.paid ?? 0;

/** Accepted affiliates whose all-time paid count is 0, by name. Those already sent are left out unless includeSent. */
export async function listMotivationCandidates(includeSent: boolean): Promise<MotivationCandidate[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("affiliates")
    .select("id, name, code, email, status, motivation_emailed_at")
    .eq("status", "accepted");
  if (error) throw error;
  const board = await getAffiliateBoard("all");
  return ((data ?? []) as AffiliateRow[])
    .filter((a) => a.code && paidOf(board, a.id) === 0 && (includeSent || a.motivation_emailed_at === null))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ id: a.id, name: a.name, email: a.email, sentAt: a.motivation_emailed_at }));
}

/** The same leader line and top 5 for everyone: public name, team and paid count only. */
function boardParts(board: AffiliateBoard): Pick<MotivationInput, "leaderLine" | "top"> {
  const ranked = board.rows.filter((r) => r.paid >= 1);
  const leader = ranked[0];
  const top: TopRow[] = ranked.slice(0, TOP_N).map((r) => ({ rank: r.rank, publicName: r.publicName, team: r.team, paid: r.paid, isMe: false }));
  const leaderLine = leader
    ? `Current leader: ${leader.publicName} with ${leader.paid} paid participant${leader.paid === 1 ? "" : "s"}`
    : null;
  return { leaderLine, top };
}

/**
 * Sends the Motivation email to the given ids (at most 25, duplicates ignored). Every id is checked again here:
 * accepted, no paid sale, has an email and a code, and not already sent unless includeSent.
 */
export async function sendMotivationBatch(ids: string[], opts: { includeSent: boolean; sendId?: string }): Promise<MotivationBatchResult> {
  const unique = Array.from(new Set(ids));
  if (unique.length > MOTIVATION_MAX_IDS) throw new RangeError(`At most ${MOTIVATION_MAX_IDS} people per send.`);
  const result: MotivationBatchResult = { sent: 0, failed: 0, skipped: 0, limitReached: false, remainingToday: 0 };
  if (unique.length === 0) {
    result.remainingToday = Math.max(0, MOTIVATION_DAILY_LIMIT - (await countSentLast24h()));
    return result;
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("affiliates")
    .select("id, name, code, email, status, motivation_emailed_at")
    .in("id", unique);
  if (error) throw error;
  const byId = new Map(((data ?? []) as AffiliateRow[]).map((a) => [a.id, a]));
  const board = await getAffiliateBoard("all");
  const parts = boardParts(board);
  const supportWa = affiliateSupportWa();

  // For the send history: who was attempted, and the first email built (an example of what each person got).
  const sentNames: { name: string }[] = [];
  const failedNames: { name: string }[] = [];
  let example: { subject: string; html: string } | null = null;

  for (const id of unique) {
    const a = byId.get(id);
    if (!a || a.status !== "accepted" || !a.email || !a.code || paidOf(board, id) !== 0 || (!opts.includeSent && a.motivation_emailed_at !== null)) {
      result.skipped++;
      continue;
    }

    // Daily limit: stop and leave the rest unclaimed for tomorrow.
    if ((await countSentLast24h()) >= MOTIVATION_DAILY_LIMIT) {
      result.limitReached = true;
      break;
    }

    // Claim: only where the timestamp is still the one we read (null for a first send).
    const previous = a.motivation_emailed_at;
    const stamp = new Date().toISOString();
    let claim = admin.from("affiliates").update({ motivation_emailed_at: stamp }).eq("id", id);
    claim = previous === null ? claim.is("motivation_emailed_at", null) : claim.eq("motivation_emailed_at", previous);
    const { data: claimed, error: claimError } = await claim.select("id");
    if (claimError) console.error("[affiliate-motivation] could not claim an affiliate");
    if (claimError || !claimed || claimed.length === 0) {
      result.skipped++;
      continue;
    }

    let ok = false;
    try {
      const input: MotivationInput = { name: a.name, code: a.code, ...parts, supportWa };
      if (opts.sendId && !example) example = motivationEmail(input);
      ok = await sendMotivation({ id: a.id, name: a.name, email: a.email }, input);
    } catch {
      console.error("[affiliate-motivation] could not build or send a Motivation email");
      ok = false;
    }
    if (ok) {
      result.sent++;
      sentNames.push({ name: a.name });
      continue;
    }
    result.failed++;
    failedNames.push({ name: a.name });
    // Give the claim back, only if it is still ours.
    const { error: releaseError } = await admin
      .from("affiliates")
      .update({ motivation_emailed_at: previous })
      .eq("id", id)
      .eq("motivation_emailed_at", stamp);
    if (releaseError) console.error("[affiliate-motivation] could not release a claim after a failed send");
  }

  result.remainingToday = Math.max(0, MOTIVATION_DAILY_LIMIT - (await countSentLast24h()));
  if (result.remainingToday === 0) result.limitReached = true;

  // History: one row per button press. The screen sends its chunks one after another, so the read-then-update inside
  // recordMotivationSend cannot race. It never throws and never changes what is returned.
  if (opts.sendId && example && (sentNames.length > 0 || failedNames.length > 0)) {
    await recordMotivationSend({ id: opts.sendId, subject: example.subject, html: example.html, sent: sentNames, failed: failedNames });
  }
  return result;
}
