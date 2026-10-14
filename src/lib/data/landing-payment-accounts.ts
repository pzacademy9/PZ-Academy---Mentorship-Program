// src/lib/data/landing-payment-accounts.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type PaymentAccountKind = "bank" | "wallet" | "paypal";
export interface PaymentAccount {
  key: string;
  label: string;
  kind: PaymentAccountKind;
  rows: { label: string; value: string }[];
  displayText: string;
}

const KINDS: readonly string[] = ["bank", "wallet", "paypal"];

function cleanRows(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const { label, value } = r as Record<string, unknown>;
    return typeof label === "string" && typeof value === "string" ? [{ label, value }] : [];
  });
}

/**
 * The global payment-account library (seeded by migration 0069). With `keys`, only those
 * accounts come back, in the caller's order (a region lists its accounts in display order);
 * unknown keys are skipped. Throws on a read error so a route answers 500 instead of
 * showing a pay step with no accounts.
 */
export async function listPaymentAccounts(keys?: string[]): Promise<PaymentAccount[]> {
  const wanted = keys ? Array.from(new Set(keys)) : undefined;
  if (wanted && wanted.length === 0) return [];
  const admin = createAdminSupabase();
  let query = admin.from("payment_accounts").select("key, label, kind, rows, display_text").eq("active", true).order("sort").order("key");
  if (wanted) query = query.in("key", wanted);
  const { data, error } = await query;
  if (error) throw error;
  const all: PaymentAccount[] = (data ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    kind: KINDS.includes(r.kind) ? (r.kind as PaymentAccountKind) : "bank",
    rows: cleanRows(r.rows),
    displayText: r.display_text ?? "",
  }));
  if (!wanted) return all;
  return wanted.flatMap((k) => all.filter((a) => a.key === k));
}
