// src/lib/data/landing-payment-accounts.ts
import "server-only";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ACCOUNT_KEY_RE, accountCreateSchema, accountPatchSchema } from "@/lib/validations/landing-payment";

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

// ---------------------------------------------------------------- admin writes

/** Lower-case, `_` separated key from a label; "" when it has no letters or numbers. */
function keyFromLabel(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36)
    .replace(/_+$/g, "");
  return base.length >= 2 ? base : "";
}

function uniqueKey(base: string, taken: Set<string>, from = 1): string {
  let n = from;
  let key = n === 1 ? base : `${base}_${n}`;
  while (taken.has(key)) {
    n += 1;
    key = `${base}_${n}`;
  }
  return key;
}

/**
 * Adds an account at the end of the library. The key comes from the label (`faysal_bank`, then
 * `faysal_bank_2`, `_3`). Throws on a database error.
 */
export async function createPaymentAccount(input: {
  label: string;
  kind: PaymentAccountKind;
  rows: { label: string; value: string }[];
  displayText: string;
}): Promise<{ ok: true; key: string } | { ok: false; reason: "invalid" }> {
  const parsed = accountCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const base = keyFromLabel(parsed.data.label);
  if (!base) return { ok: false, reason: "invalid" };
  const admin = createAdminSupabase();
  const existing = await admin.from("payment_accounts").select("key, sort");
  if (existing.error) throw existing.error;
  const taken = new Set((existing.data ?? []).map((a) => a.key));
  const sort = (existing.data ?? []).reduce((m, a) => Math.max(m, a.sort), 0) + 10;
  let attempt = 1;
  for (let i = 0; i < 4; i++) {
    const key = uniqueKey(base, taken, attempt);
    const { error } = await admin.from("payment_accounts").insert({
      key,
      label: parsed.data.label,
      kind: parsed.data.kind,
      rows: parsed.data.rows,
      display_text: parsed.data.displayText,
      sort,
      active: true,
    });
    if (!error) return { ok: true, key };
    if (error.code !== "23505") throw error;
    // Someone took the key a moment ago: try the next suffix.
    taken.add(key);
    attempt = Number(key.match(/_(\d+)$/)?.[1] ?? 1) + 1;
    if (key === base) attempt = 2;
  }
  throw new Error("Could not find a free account key");
}

/** Edits or hides (`active: false`) an account. Never deletes. ok:false when nothing matched. */
export async function updatePaymentAccount(
  key: string,
  patch: { label?: string; kind?: PaymentAccountKind; rows?: { label: string; value: string }[]; displayText?: string; active?: boolean },
): Promise<{ ok: boolean }> {
  if (!ACCOUNT_KEY_RE.test(key)) return { ok: false };
  const parsed = accountPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false };
  const v = parsed.data;
  const update: TablesUpdate<"payment_accounts"> = { updated_at: new Date().toISOString() };
  if (v.label !== undefined) update.label = v.label;
  if (v.kind !== undefined) update.kind = v.kind;
  if (v.rows !== undefined) update.rows = v.rows;
  if (v.displayText !== undefined) update.display_text = v.displayText;
  if (v.active !== undefined) update.active = v.active;
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("payment_accounts").update(update).eq("key", key).select("key");
  if (error) throw error;
  return { ok: (data ?? []).length > 0 };
}

/** An account as the admin screen sees it: hidden accounts included, with all its details. */
export interface PaymentAccountFull extends PaymentAccount {
  active: boolean;
}

/** Every account in the library, hidden ones included (admin screen). Throws on a read error. */
export async function listAllPaymentAccounts(): Promise<PaymentAccountFull[]> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("payment_accounts").select("key, label, kind, rows, display_text, active").order("sort").order("key");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    kind: KINDS.includes(r.kind) ? (r.kind as PaymentAccountKind) : "bank",
    rows: cleanRows(r.rows),
    displayText: r.display_text ?? "",
    active: r.active,
  }));
}
