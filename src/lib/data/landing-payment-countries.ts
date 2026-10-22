// src/lib/data/landing-payment-countries.ts
import "server-only";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listPaymentAccounts, type PaymentAccountKind } from "@/lib/data/landing-payment-accounts";
import { REGION_KEY_RE, countryAccountsSchema, countryCreateSchema, countryPatchSchema } from "@/lib/validations/landing-payment";

/**
 * Central payment accounts per country (migration 0081). A country owns only the list of accounts
 * to show; a page region keeps its own label, currency, class time and timezone.
 */

export interface PaymentCountryAccount {
  key: string;
  label: string;
  kind: PaymentAccountKind;
  active: boolean;
  sort: number;
}
export interface PaymentCountry {
  regionKey: string;
  name: string;
  sort: number;
  active: boolean;
  accounts: PaymentCountryAccount[];
}

const KINDS: readonly string[] = ["bank", "wallet", "paypal"];

/** The new tables are not there yet: Postgres 42P01, or PostgREST's schema-cache miss (PGRST205). */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/** Every country (by sort) with ALL its accounts, hidden ones included (admin screen). Throws on a read error. */
export async function listPaymentCountries(): Promise<PaymentCountry[]> {
  const admin = createAdminSupabase();
  const [countries, links, accounts] = await Promise.all([
    admin.from("payment_countries").select("region_key, name, sort, active").order("sort").order("region_key"),
    admin.from("payment_country_accounts").select("region_key, account_key, sort").order("sort").order("account_key"),
    admin.from("payment_accounts").select("key, label, kind, active"),
  ]);
  if (countries.error) throw countries.error;
  if (links.error) throw links.error;
  if (accounts.error) throw accounts.error;
  const byKey = new Map((accounts.data ?? []).map((a) => [a.key, a]));
  return (countries.data ?? [])
    .map((c) => ({
      regionKey: c.region_key,
      name: c.name,
      sort: c.sort,
      active: c.active,
      accounts: (links.data ?? [])
        .filter((l) => l.region_key === c.region_key && byKey.has(l.account_key))
        .sort((a, b) => a.sort - b.sort || a.account_key.localeCompare(b.account_key))
        .map((l) => {
          const a = byKey.get(l.account_key)!;
          return {
            key: a.key,
            label: a.label,
            kind: KINDS.includes(a.kind) ? (a.kind as PaymentAccountKind) : ("bank" as const),
            active: a.active,
            sort: l.sort,
          };
        }),
    }))
    .sort((a, b) => a.sort - b.sort || a.regionKey.localeCompare(b.regionKey));
}

/**
 * Region key -> ordered ACTIVE account keys of its (active) central country. A region with no
 * country, no visible account, or tables that do not exist yet is absent from the result.
 */
export async function centralAccountKeys(regionKeys: string[]): Promise<Record<string, string[]>> {
  const wanted = Array.from(new Set(regionKeys));
  if (wanted.length === 0) return {};
  const admin = createAdminSupabase();
  const countries = await admin.from("payment_countries").select("region_key").eq("active", true).in("region_key", wanted);
  if (isMissingTable(countries.error)) return {};
  if (countries.error) throw countries.error;
  const live = (countries.data ?? []).map((c) => c.region_key);
  if (live.length === 0) return {};
  const links = await admin
    .from("payment_country_accounts")
    .select("region_key, account_key, sort")
    .in("region_key", live)
    .order("sort")
    .order("account_key");
  if (isMissingTable(links.error)) return {};
  if (links.error) throw links.error;
  const accounts = await admin.from("payment_accounts").select("key").eq("active", true);
  if (accounts.error) throw accounts.error;
  const active = new Set((accounts.data ?? []).map((a) => a.key));
  const out: Record<string, string[]> = {};
  for (const l of [...(links.data ?? [])].sort((a, b) => a.sort - b.sort || a.account_key.localeCompare(b.account_key))) {
    if (!active.has(l.account_key)) continue;
    (out[l.region_key] ??= []).push(l.account_key);
  }
  return out;
}

/**
 * Final ordered account keys per page region. The central list wins; with none, the region's own
 * old accountKeys, filtered to active accounts. A hidden account is never returned.
 */
export async function resolveRegionAccountKeys(
  regions: { key: string; accountKeys: string[] }[],
): Promise<Record<string, string[]>> {
  const central = await centralAccountKeys(regions.map((r) => r.key));
  const needOld = regions.filter((r) => !central[r.key]);
  const oldKeys = needOld.flatMap((r) => r.accountKeys);
  const active = new Set(oldKeys.length > 0 ? (await listPaymentAccounts(oldKeys)).map((a) => a.key) : []);
  const out: Record<string, string[]> = {};
  for (const r of regions) {
    out[r.key] = central[r.key] ?? Array.from(new Set(r.accountKeys)).filter((k) => active.has(k));
  }
  return out;
}

/**
 * resolveRegionAccountKeys that can never break the pay step: on ANY error it logs and falls back
 * to each region's own accountKeys (the old per-page list).
 */
export async function resolveAccountKeysSafe(
  regions: { key: string; accountKeys: string[] }[],
): Promise<Record<string, string[]>> {
  try {
    return await resolveRegionAccountKeys(regions);
  } catch (error) {
    console.error("[payment-accounts] could not resolve the central account lists, using the page's own", error);
    return Object.fromEntries(regions.map((r) => [r.key, r.accountKeys]));
  }
}

// ---------------------------------------------------------------- admin writes

/** Adds a country at the end of the list. `exists` when the region key is taken. Throws on other errors. */
export async function createPaymentCountry(input: { regionKey: string; name: string }): Promise<{ ok: true } | { ok: false; reason: "invalid" | "exists" }> {
  const parsed = countryCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const admin = createAdminSupabase();
  const existing = await admin.from("payment_countries").select("sort");
  if (existing.error) throw existing.error;
  const sort = (existing.data ?? []).reduce((m, c) => Math.max(m, c.sort), 0) + 10;
  const { error } = await admin
    .from("payment_countries")
    .insert({ region_key: parsed.data.regionKey, name: parsed.data.name, sort, active: true });
  if (error?.code === "23505") return { ok: false, reason: "exists" };
  if (error) throw error;
  return { ok: true };
}

/** Renames or hides a country (`active: false`). ok:false when nothing matched. */
export async function updatePaymentCountry(regionKey: string, patch: { name?: string; active?: boolean }): Promise<{ ok: boolean }> {
  if (!REGION_KEY_RE.test(regionKey)) return { ok: false };
  const parsed = countryPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false };
  const update: TablesUpdate<"payment_countries"> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.active !== undefined) update.active = parsed.data.active;
  const admin = createAdminSupabase();
  const { data, error } = await admin.from("payment_countries").update(update).eq("region_key", regionKey).select("region_key");
  if (error) throw error;
  return { ok: (data ?? []).length > 0 };
}

/**
 * Replaces a country's account list (array order, sort = index * 10) in one database transaction
 * (migration 0082). ok:false for an unknown country or account, a duplicate, more than 12, or when
 * the function is not installed yet; in every such case nothing is written.
 */
export async function setCountryAccounts(regionKey: string, accountKeys: string[]): Promise<{ ok: boolean }> {
  if (!REGION_KEY_RE.test(regionKey)) return { ok: false };
  const parsed = countryAccountsSchema.safeParse({ accountKeys });
  if (!parsed.success) return { ok: false };
  const keys = parsed.data.accountKeys;
  const admin = createAdminSupabase();
  if (keys.length > 0) {
    const found = await admin.from("payment_accounts").select("key").in("key", keys);
    if (found.error) throw found.error;
    if ((found.data ?? []).length !== keys.length) return { ok: false };
  }
  const { error } = await admin.rpc("landing_set_country_accounts", { p_region_key: regionKey, p_account_keys: keys });
  if (!error) return { ok: true };
  if (error.code === "PGRST202" || error.code === "42883") {
    console.error("landing_set_country_accounts is missing: paste migration 0082", error);
    return { ok: false };
  }
  // The function raises (default P0001) for an unknown country or key; nothing was written.
  if (error.code === "P0001") return { ok: false };
  throw error;
}
