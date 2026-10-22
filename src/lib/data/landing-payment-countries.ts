// src/lib/data/landing-payment-countries.ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { listPaymentAccounts, type PaymentAccountKind } from "@/lib/data/landing-payment-accounts";

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
