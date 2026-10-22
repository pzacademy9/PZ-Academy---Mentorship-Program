import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, filterValue, type Op } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { centralAccountKeys, listPaymentCountries, resolveRegionAccountKeys } from "@/lib/data/landing-payment-countries";

type Row = Record<string, unknown>;
const countries: Row[] = [
  { region_key: "PK", name: "Pakistan", sort: 10, active: true },
  { region_key: "PH", name: "Philippines", sort: 20, active: true },
  { region_key: "UAE", name: "United Arab Emirates", sort: 30, active: true },
  { region_key: "KSA", name: "Saudi Arabia", sort: 40, active: true },
];
const links: Row[] = [
  { region_key: "PK", account_key: "easypaisa", sort: 20 },
  { region_key: "PK", account_key: "faysal", sort: 10 },
  { region_key: "PH", account_key: "gcash", sort: 20 },
  { region_key: "PH", account_key: "pnb_ph", sort: 10 },
  { region_key: "UAE", account_key: "mashreq", sort: 10 },
];
const acct = (key: string, active = true, sort = 0): Row => ({ key, label: key.toUpperCase(), kind: "bank", rows: [], display_text: "", sort, active });
let accounts: Row[];

/** Answers the three tables from the fixtures, honouring eq("active") and in(...) filters. */
function serve(op: Op) {
  const inList = (col: string) => filterValue(op, "in", col) as string[] | undefined;
  const activeOnly = filterValue(op, "eq", "active") === true;
  const pick = (rows: Row[], col: string) => {
    const keys = inList(col);
    return rows.filter((r) => (!keys || keys.includes(r[col] as string)) && (!activeOnly || r.active === true));
  };
  if (op.table === "payment_countries") return { data: pick(countries, "region_key"), error: null };
  if (op.table === "payment_country_accounts") return { data: pick(links, "region_key"), error: null };
  if (op.table === "payment_accounts") return { data: pick(accounts, "key"), error: null };
  return { data: null, error: { message: "unexpected " + op.table } };
}

beforeEach(() => {
  db.reset();
  accounts = [acct("faysal", true, 10), acct("easypaisa", true, 20), acct("mashreq"), acct("pnb_ph"), acct("gcash"), acct("anb", false), acct("paypal", true, 80)];
  db.state.handler = serve;
});

describe("centralAccountKeys", () => {
  it("returns active account keys per region in link sort order", async () => {
    await expect(centralAccountKeys(["PK", "PH", "UAE"])).resolves.toEqual({
      PK: ["faysal", "easypaisa"],
      PH: ["pnb_ph", "gcash"],
      UAE: ["mashreq"],
    });
  });
  it("drops hidden accounts and omits a region whose accounts are all hidden", async () => {
    accounts = accounts.map((a) => (["gcash", "mashreq"].includes(a.key as string) ? { ...a, active: false } : a));
    const out = await centralAccountKeys(["PH", "UAE"]);
    expect(out).toEqual({ PH: ["pnb_ph"] });
    expect("UAE" in out).toBe(false);
  });
  it("omits a region with no central country and one whose country is hidden", async () => {
    countries[0] = { ...countries[0], active: false };
    try {
      await expect(centralAccountKeys(["PK", "IN"])).resolves.toEqual({});
    } finally {
      countries[0] = { ...countries[0], active: true };
    }
  });
  it("skips the database for an empty list", async () => {
    await expect(centralAccountKeys([])).resolves.toEqual({});
    expect(db.state.ops).toHaveLength(0);
  });
  it("returns {} for a missing table: Postgres 42P01", async () => {
    db.state.handler = () => ({ data: null, error: { code: "42P01", message: 'relation "payment_countries" does not exist' } });
    await expect(centralAccountKeys(["PK"])).resolves.toEqual({});
  });
  it("returns {} for a missing table: PostgREST PGRST205 schema-cache error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table 'public.payment_countries' in the schema cache" } });
    await expect(centralAccountKeys(["PK"])).resolves.toEqual({});
  });
  it("returns {} when only the second table is missing", async () => {
    db.state.handler = (op) => (op.table === "payment_country_accounts" ? { data: null, error: { code: "42P01" } } : serve(op));
    await expect(centralAccountKeys(["PK"])).resolves.toEqual({});
  });
  it("throws any other error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006", message: "connection failure" } });
    await expect(centralAccountKeys(["PK"])).rejects.toMatchObject({ code: "08006" });
  });
});

describe("resolveRegionAccountKeys", () => {
  it("prefers the central list over the region's own keys", async () => {
    await expect(resolveRegionAccountKeys([{ key: "PK", accountKeys: ["paypal", "easypaisa", "faysal"] }])).resolves.toEqual({ PK: ["faysal", "easypaisa"] });
  });
  it("falls back to the region's own keys, active only and in the region's order, when there is no central list", async () => {
    await expect(resolveRegionAccountKeys([{ key: "KSA", accountKeys: ["paypal", "anb"] }, { key: "IN", accountKeys: ["paypal"] }])).resolves.toEqual({
      KSA: ["paypal"],
      IN: ["paypal"],
    });
  });
  it("falls back when every central account is hidden, never showing a hidden one", async () => {
    accounts = accounts.map((a) => (a.key === "mashreq" ? { ...a, active: false } : a));
    await expect(resolveRegionAccountKeys([{ key: "UAE", accountKeys: ["paypal", "mashreq"] }])).resolves.toEqual({ UAE: ["paypal"] });
  });
  it("returns [] for a region with neither a central list nor usable old keys", async () => {
    await expect(resolveRegionAccountKeys([{ key: "KSA", accountKeys: ["anb"] }, { key: "XX", accountKeys: [] }])).resolves.toEqual({ KSA: [], XX: [] });
  });
  it("uses the old keys when the new tables do not exist yet", async () => {
    db.state.handler = (op) => (op.table === "payment_accounts" ? serve(op) : { data: null, error: { code: "PGRST205" } });
    await expect(resolveRegionAccountKeys([{ key: "PK", accountKeys: ["easypaisa", "faysal"] }])).resolves.toEqual({ PK: ["easypaisa", "faysal"] });
    db.state.handler = (op) => (op.table === "payment_accounts" ? serve(op) : { data: null, error: { code: "42P01" } });
    await expect(resolveRegionAccountKeys([{ key: "PK", accountKeys: ["faysal"] }])).resolves.toEqual({ PK: ["faysal"] });
  });
  it("does not touch payment_accounts when every region has a central list", async () => {
    await resolveRegionAccountKeys([{ key: "PK", accountKeys: ["paypal"] }]);
    expect(db.state.ops.some((o) => o.table === "payment_accounts" && o.filters.some(([k, c]) => k === "in" && c === "key"))).toBe(false);
  });
});

describe("listPaymentCountries", () => {
  it("returns every country in sort order with all its accounts, hidden included, in link order", async () => {
    accounts = accounts.map((a) => (a.key === "gcash" ? { ...a, active: false } : a));
    const out = await listPaymentCountries();
    expect(out.map((c) => c.regionKey)).toEqual(["PK", "PH", "UAE", "KSA"]);
    expect(out[1].accounts.map((a) => [a.key, a.active])).toEqual([["pnb_ph", true], ["gcash", false]]);
    expect(out[0]).toMatchObject({ regionKey: "PK", name: "Pakistan", sort: 10, active: true });
    expect(out[0].accounts[0]).toEqual({ key: "faysal", label: "FAYSAL", kind: "bank", active: true, sort: 10 });
    expect(out[3].accounts).toEqual([]);
  });
  it("throws on a read error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(listPaymentCountries()).rejects.toMatchObject({ code: "08006" });
  });
});
