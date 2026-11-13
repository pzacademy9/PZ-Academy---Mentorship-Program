// src/lib/data/affiliate-progress.ts
// The automatic Progress email. Every Paid registration with an affiliate code has one affiliate_commissions row;
// rows not yet emailed are picked up here, one email per affiliate covering all their new rows.
//
// Exactly-once rule: the rows are CLAIMED (progress_emailed_at set, only where it is still null) before the send.
// Only the ids the claim returned are ours. On a failed send exactly those rows are released and get one more attempt;
// after 5 attempts a row is left alone (the failure shows in the affiliate's email history).
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { getAffiliateBoard, type AffiliateBoard } from "@/lib/data/affiliate-leaderboard";
import { getEmailMessage } from "@/lib/data/affiliate-email-settings";
import { countSentLast24h } from "@/lib/data/affiliate-emails";
import { sendProgress } from "@/lib/affiliates/send";
import { affiliateSupportWa } from "@/lib/affiliates/contact";
import { gapFor, gapLine } from "@/lib/affiliates/leaderboard";
import {
  balancePkr,
  commissionPercent,
  monthKey,
  paidInMonth,
  paidSoFar,
  previousMonthKey,
  splitCommissions,
} from "@/lib/affiliates/commission";
import type { ProgressInput, TopRow } from "@/lib/affiliates/rich-emails";

const MAX_ATTEMPTS = 5;
const MAX_AFFILIATES = 40;
const DAILY_LIMIT = 300;
// The cron route allows 60 seconds; stop starting new affiliates after 40 so a started send can finish.
const TIME_BUDGET_MS = 40_000;
const PENDING_READ_LIMIT = 2000;
const TOP_N = 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type ProgressRunResult = { affiliates: number; sent: number; failed: number; skipped: number };

type Claimed = { id: string; progress_attempts: number };

/** Top 10 with a paid sale, plus the affiliate's own row after them when they rank lower. No money, no contact details. */
function topRows(board: AffiliateBoard, affiliateId: string): TopRow[] {
  const ranked = board.rows.filter((r) => r.paid >= 1);
  const pick = ranked.slice(0, TOP_N);
  const me = ranked.find((r) => r.affiliateId === affiliateId);
  if (me && !pick.includes(me)) pick.push(me);
  return pick.map((r) => ({ rank: r.rank, publicName: r.publicName, team: r.team, paid: r.paid, isMe: r.affiliateId === affiliateId }));
}

export async function runProgressEmails(
  now: Date = new Date(),
  opts: { clock?: () => number } = {},
): Promise<ProgressRunResult> {
  const clock = opts.clock ?? Date.now;
  const startedAt = clock();
  const admin = createAdminSupabase();
  const stamp = now.toISOString();
  const result: ProgressRunResult = { affiliates: 0, sent: 0, failed: 0, skipped: 0 };

  const { data: pending, error: pendingError } = await admin
    .from("affiliate_commissions")
    .select("id, affiliate_id, created_at")
    .is("progress_emailed_at", null)
    .is("voided_at", null)
    .lt("progress_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(PENDING_READ_LIMIT);
  if (pendingError) throw pendingError;

  // Grouped in order of each affiliate's oldest pending row (Map keeps insertion order).
  const groups = new Map<string, string[]>();
  for (const r of pending ?? []) {
    const ids = groups.get(r.affiliate_id) ?? [];
    ids.push(r.id);
    groups.set(r.affiliate_id, ids);
  }
  const batch = Array.from(groups.entries()).slice(0, MAX_AFFILIATES);
  if (batch.length === 0) return result;

  const board = await getAffiliateBoard("all", now);
  const message = await getEmailMessage();
  const supportWa = affiliateSupportWa();

  // Marks rows handled without an email (not accepted, no code, no email address).
  const markHandled = async (ids: string[]) => {
    const { error } = await admin.from("affiliate_commissions").update({ progress_emailed_at: stamp }).in("id", ids).is("progress_emailed_at", null);
    if (error) console.error("[affiliate-progress] could not mark rows as handled");
  };

  // Gives back exactly the claimed rows, one more attempt each. The rows are ours while claimed, so read-then-write is safe.
  const release = async (claimed: Claimed[]) => {
    for (const c of claimed) {
      const { error } = await admin
        .from("affiliate_commissions")
        .update({ progress_emailed_at: null, progress_attempts: c.progress_attempts + 1 })
        .eq("id", c.id);
      if (error) console.error("[affiliate-progress] could not release a claimed row");
    }
  };

  type AffiliateRow = {
    id: string;
    name: string;
    code: string;
    email: string;
    commission_mode: string;
    manual_percent: number | string | null;
    opening_secured: number;
    opening_commission: number | string;
    opening_withdrawn: number | string;
  };

  // Same numbers as the private page (buildPageModel). False when the commissions could not be read or the send failed.
  const buildAndSend = async (affiliateId: string, a: AffiliateRow): Promise<boolean> => {
    const { data: rows, error: rowsError } = await admin
      .from("affiliate_commissions")
      .select("currency, commission, commission_pkr, voided_at, created_at")
      .eq("affiliate_id", affiliateId);
    if (rowsError) return false;

    const commissions = (rows ?? []).map((c) => ({
      currency: c.currency,
      commission: Number(c.commission),
      commissionPkr: c.commission_pkr === null ? null : Number(c.commission_pkr),
      voided: c.voided_at !== null,
      createdAt: c.created_at,
    }));
    const live = commissions.filter((c) => !c.voided).length;
    const openingCommission = Number(a.opening_commission);
    const split = splitCommissions(commissions);
    const percent = commissionPercent({
      mode: a.commission_mode === "manual" ? "manual" : "automatic",
      manualPercent: a.manual_percent === null ? null : Number(a.manual_percent),
      lastMonthPaid: paidInMonth(commissions, previousMonthKey(monthKey(now))),
      openingSecured: a.opening_secured,
      now,
    });
    const me = board.rows.find((r) => r.affiliateId === affiliateId);
    const rank = me && me.paid >= 1 ? me.rank : null;
    const gap = rank !== null ? gapFor(board.rows, affiliateId) : null;

    const input: ProgressInput = {
      name: a.name,
      code: a.code,
      paid: paidSoFar(a.opening_secured, live),
      commissionPkr: round2(openingCommission + split.earnedPkr),
      balancePkr: balancePkr({ openingCommission, openingWithdrawn: Number(a.opening_withdrawn), pkrCommissions: [split.earnedPkr] }),
      percent,
      rank,
      gapLine: gapLine(gap ?? { kind: "none" }),
      top: topRows(board, affiliateId),
      supportWa,
      message,
    };
    return sendProgress({ id: a.id, name: a.name, email: a.email }, input);
  };

  for (const [affiliateId, ids] of batch) {
    // Time budget: the rest is picked up by the next run (5 minutes later).
    if (clock() - startedAt >= TIME_BUDGET_MS) break;
    result.affiliates++;

    const { data: a, error: aError } = await admin
      .from("affiliates")
      .select("id, name, code, team, email, status, commission_mode, manual_percent, opening_secured, opening_commission, opening_withdrawn")
      .eq("id", affiliateId)
      .maybeSingle();
    if (aError) {
      // Nothing claimed: the rows stay pending for the next run.
      console.error("[affiliate-progress] could not read an affiliate");
      result.skipped++;
      continue;
    }
    if (!a || a.status !== "accepted" || !a.code || !a.email) {
      await markHandled(ids);
      result.skipped++;
      continue;
    }

    // Daily Brevo limit: stop the whole run and leave the rest unclaimed.
    if ((await countSentLast24h()) >= DAILY_LIMIT) {
      result.affiliates--;
      break;
    }

    const { data: claimedData, error: claimError } = await admin
      .from("affiliate_commissions")
      .update({ progress_emailed_at: stamp })
      .in("id", ids)
      .is("progress_emailed_at", null)
      .select("id, progress_attempts");
    if (claimError) console.error("[affiliate-progress] could not claim rows");
    const claimed: Claimed[] = claimError ? [] : ((claimedData ?? []) as Claimed[]);
    if (claimed.length === 0) {
      // Another run has them (or the claim failed and nothing changed).
      result.skipped++;
      continue;
    }

    // From here on the rows are claimed: any failure, thrown or returned, gives them back.
    let ok = false;
    try {
      ok = await buildAndSend(affiliateId, { ...a, code: a.code, email: a.email });
    } catch {
      console.error("[affiliate-progress] could not build or send a Progress email");
      ok = false;
    }
    if (ok) {
      result.sent++;
    } else {
      await release(claimed);
      result.failed++;
    }
  }
  return result;
}
