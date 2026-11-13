// src/lib/data/affiliate-payouts.ts
// Payout requests: the affiliate asks, the admin marks paid or rejects.
// The full account number only ever leaves here inside PayoutRow (admin screens).
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { WITHDRAW_PKR, maskAccount, type PayoutMethod, type PayoutStatus } from "@/lib/affiliates/payouts";

export type PayoutRow = {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateCode: string | null;
  amountPkr: number;
  method: PayoutMethod;
  accountTitle: string;
  accountNumber: string;
  status: PayoutStatus;
  rejectReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

export type HistoryRow = {
  id: string;
  amountPkr: number;
  method: PayoutMethod;
  accountMask: string;
  status: PayoutStatus;
  rejectReason: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

const COLS = "id, affiliate_id, amount_pkr, method, account_title, account_number, status, reject_reason, requested_at, decided_at";
const JOINED = `${COLS}, affiliates(name, code)`;

type DbRow = {
  id: string;
  affiliate_id: string;
  amount_pkr: number;
  method: string;
  account_title: string;
  account_number: string;
  status: string;
  reject_reason: string | null;
  requested_at: string;
  decided_at: string | null;
  affiliates?: { name: string; code: string | null } | { name: string; code: string | null }[] | null;
};

function toPayoutRow(r: DbRow): PayoutRow {
  const a = Array.isArray(r.affiliates) ? r.affiliates[0] : r.affiliates;
  return {
    id: r.id,
    affiliateId: r.affiliate_id,
    affiliateName: a?.name ?? "",
    affiliateCode: a?.code ?? null,
    amountPkr: Number(r.amount_pkr),
    method: r.method as PayoutMethod,
    accountTitle: r.account_title,
    accountNumber: r.account_number,
    status: r.status as PayoutStatus,
    rejectReason: r.reject_reason,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
  };
}

/** One affiliate's payout history, newest first. Masked account only. Throws on a read error. */
export async function listAffiliateHistory(affiliateId: string): Promise<HistoryRow[]> {
  const { data, error } = await createAdminSupabase()
    .from("affiliate_payouts")
    .select(COLS)
    .eq("affiliate_id", affiliateId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DbRow[]).map((r) => ({
    id: r.id,
    amountPkr: Number(r.amount_pkr),
    method: r.method as PayoutMethod,
    accountMask: maskAccount(r.account_number),
    status: r.status as PayoutStatus,
    rejectReason: r.reject_reason,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
  }));
}

/** Every payout request with the affiliate's name and code, newest first. Admin only. Throws on a read error. */
export async function listAdminPayouts(): Promise<PayoutRow[]> {
  const { data, error } = await createAdminSupabase()
    .from("affiliate_payouts")
    .select(JOINED)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as DbRow[]).map(toPayoutRow);
}

/** Asks for the whole available balance. One pending request per affiliate (unique index). */
export async function requestPayout(a: {
  affiliateId: string;
  available: number;
  method: PayoutMethod;
  title: string;
  number: string;
}): Promise<{ ok: true; amountPkr: number } | { ok: false; reason: "below-minimum" | "already-pending" | "error" }> {
  if (a.available < WITHDRAW_PKR) return { ok: false, reason: "below-minimum" };
  try {
    const { error } = await createAdminSupabase().from("affiliate_payouts").insert({
      affiliate_id: a.affiliateId,
      amount_pkr: a.available,
      method: a.method,
      account_title: a.title,
      account_number: a.number,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") return { ok: false, reason: "already-pending" };
      console.error("[affiliate-payouts] could not save the request:", error.message);
      return { ok: false, reason: "error" };
    }
    return { ok: true, amountPkr: a.available };
  } catch (e) {
    console.error("[affiliate-payouts] could not save the request:", e);
    return { ok: false, reason: "error" };
  }
}

/** Marks a pending request paid or rejected. Only a row still pending can be decided. */
export async function decidePayout(
  id: string,
  d: { action: "paid" } | { action: "reject"; reason: string },
): Promise<{ ok: true; row: PayoutRow } | { ok: false; reason: "not-found" | "not-pending" | "error" }> {
  try {
    const db = createAdminSupabase();
    const patch =
      d.action === "paid"
        ? { status: "paid", decided_at: new Date().toISOString() }
        : { status: "rejected", reject_reason: d.reason, decided_at: new Date().toISOString() };
    const { data, error } = await db
      .from("affiliate_payouts")
      .update(patch)
      .eq("id", id)
      .eq("status", "pending")
      .select(JOINED);
    if (error) {
      console.error("[affiliate-payouts] could not decide the request:", error.message);
      return { ok: false, reason: "error" };
    }
    const rows = (data ?? []) as unknown as DbRow[];
    if (rows.length > 0) return { ok: true, row: toPayoutRow(rows[0]) };
    const { data: existing, error: readErr } = await db.from("affiliate_payouts").select("id").eq("id", id).maybeSingle();
    if (readErr) {
      console.error("[affiliate-payouts] could not check the request:", readErr.message);
      return { ok: false, reason: "error" };
    }
    return { ok: false, reason: existing ? "not-pending" : "not-found" };
  } catch (e) {
    console.error("[affiliate-payouts] could not decide the request:", e);
    return { ok: false, reason: "error" };
  }
}
