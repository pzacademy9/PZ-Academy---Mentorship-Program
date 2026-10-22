import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createSupabaseMock, filterValue, type Op } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { createPaymentAccount, updatePaymentAccount } from "@/lib/data/landing-payment-accounts";
import { createPaymentCountry, setCountryAccounts, updatePaymentCountry } from "@/lib/data/landing-payment-countries";
import { accountCreateSchema, accountPatchSchema, countryAccountsSchema, countryCreateSchema, countryPatchSchema } from "@/lib/validations/landing-payment";

type Row = Record<string, unknown>;
const input = { label: "Faysal Bank", kind: "bank" as const, rows: [{ label: "Account No.", value: "123" }], displayText: "Bank Transfer" };
let accounts: Row[];

beforeEach(() => {
  db.reset();
  accounts = [{ key: "faysal", sort: 10 }, { key: "paypal", sort: 80 }];
});

function inserted(): Row[] {
  return db.find("payment_accounts", "insert").map((o) => o.payload as Row);
}

describe("createPaymentAccount", () => {
  it("makes a lower-case underscore key from the label", async () => {
    db.state.handler = (op) => (op.op === "select" ? { data: accounts, error: null } : { data: null, error: null });
    await expect(createPaymentAccount({ ...input, label: "  Meezan Bank (PK)! " })).resolves.toEqual({ ok: true, key: "meezan_bank_pk" });
    expect(inserted()[0]).toMatchObject({ key: "meezan_bank_pk", label: "Meezan Bank (PK)!", kind: "bank", display_text: "Bank Transfer", sort: 90, active: true });
  });
  it("suffixes _2, _3 when the key exists", async () => {
    accounts = [{ key: "faysal_bank", sort: 10 }, { key: "faysal_bank_2", sort: 20 }];
    db.state.handler = (op) => (op.op === "select" ? { data: accounts, error: null } : { data: null, error: null });
    await expect(createPaymentAccount(input)).resolves.toEqual({ ok: true, key: "faysal_bank_3" });
    accounts = [{ key: "faysal_bank", sort: 10 }];
    await expect(createPaymentAccount(input)).resolves.toEqual({ ok: true, key: "faysal_bank_2" });
  });
  it("retries with the next suffix when the insert hits a duplicate key", async () => {
    let first = true;
    db.state.handler = (op) => {
      if (op.op === "select") return { data: [], error: null };
      if (first) {
        first = false;
        return { data: null, error: { code: "23505" } };
      }
      return { data: null, error: null };
    };
    await expect(createPaymentAccount(input)).resolves.toEqual({ ok: true, key: "faysal_bank_2" });
  });
  it("rejects invalid input and a label with no letters or numbers, without writing", async () => {
    db.state.handler = () => ({ data: [], error: null });
    await expect(createPaymentAccount({ ...input, label: "" })).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(createPaymentAccount({ ...input, label: "!!!" })).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(createPaymentAccount({ ...input, rows: Array.from({ length: 9 }, () => ({ label: "a", value: "b" })) })).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(inserted()).toHaveLength(0);
  });
  it("throws a database error", async () => {
    db.state.handler = (op) => (op.op === "select" ? { data: [], error: null } : { data: null, error: { code: "08006" } });
    await expect(createPaymentAccount(input)).rejects.toMatchObject({ code: "08006" });
  });
});

describe("updatePaymentAccount", () => {
  it("hides with active=false by an update, never a delete", async () => {
    db.state.handler = () => ({ data: [{ key: "faysal" }], error: null });
    await expect(updatePaymentAccount("faysal", { active: false })).resolves.toEqual({ ok: true });
    const upd = db.find("payment_accounts", "update");
    expect(upd).toHaveLength(1);
    expect(upd[0].payload).toMatchObject({ active: false });
    expect(filterValue(upd[0], "eq", "key")).toBe("faysal");
    expect(db.state.ops.some((o) => o.op === "delete")).toBe(false);
  });
  it("maps camelCase fields to columns", async () => {
    db.state.handler = () => ({ data: [{ key: "faysal" }], error: null });
    await updatePaymentAccount("faysal", { displayText: "x", label: "New" });
    expect(db.find("payment_accounts", "update")[0].payload).toMatchObject({ display_text: "x", label: "New" });
  });
  it("answers ok:false for an unknown key, an empty or invalid patch", async () => {
    db.state.handler = () => ({ data: [], error: null });
    await expect(updatePaymentAccount("nope", { active: false })).resolves.toEqual({ ok: false });
    await expect(updatePaymentAccount("faysal", {})).resolves.toEqual({ ok: false });
    await expect(updatePaymentAccount("Bad Key", { active: false })).resolves.toEqual({ ok: false });
  });
  it("throws a database error", async () => {
    db.state.handler = () => ({ data: null, error: { code: "08006" } });
    await expect(updatePaymentAccount("faysal", { active: false })).rejects.toMatchObject({ code: "08006" });
  });
});

describe("createPaymentCountry", () => {
  it("rejects a bad region key without writing", async () => {
    await expect(createPaymentCountry({ regionKey: "pk", name: "Pakistan" })).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(createPaymentCountry({ regionKey: "TOOLONG1", name: "X" })).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(db.find("payment_countries", "insert")).toHaveLength(0);
  });
  it("inserts at the end of the sort order", async () => {
    db.state.handler = (op) => (op.op === "select" ? { data: [{ sort: 10 }, { sort: 60 }], error: null } : { data: null, error: null });
    await expect(createPaymentCountry({ regionKey: "KSA", name: " Saudi " })).resolves.toEqual({ ok: true });
    expect(db.find("payment_countries", "insert")[0].payload).toMatchObject({ region_key: "KSA", name: "Saudi", sort: 70, active: true });
  });
  it("answers exists for 23505", async () => {
    db.state.handler = (op) => (op.op === "select" ? { data: [], error: null } : { data: null, error: { code: "23505" } });
    await expect(createPaymentCountry({ regionKey: "PK", name: "Pakistan" })).resolves.toEqual({ ok: false, reason: "exists" });
  });
  it("throws any other error", async () => {
    db.state.handler = (op) => (op.op === "select" ? { data: [], error: null } : { data: null, error: { code: "08006" } });
    await expect(createPaymentCountry({ regionKey: "PK", name: "Pakistan" })).rejects.toMatchObject({ code: "08006" });
  });
});

describe("updatePaymentCountry", () => {
  it("renames and hides by an update", async () => {
    db.state.handler = () => ({ data: [{ region_key: "PK" }], error: null });
    await expect(updatePaymentCountry("PK", { name: "Pak", active: false })).resolves.toEqual({ ok: true });
    const upd = db.find("payment_countries", "update")[0];
    expect(upd.payload).toMatchObject({ name: "Pak", active: false });
    expect(filterValue(upd, "eq", "region_key")).toBe("PK");
  });
  it("answers ok:false for an unknown country or empty patch", async () => {
    db.state.handler = () => ({ data: [], error: null });
    await expect(updatePaymentCountry("PK", { active: true })).resolves.toEqual({ ok: false });
    await expect(updatePaymentCountry("PK", {})).resolves.toEqual({ ok: false });
  });
});

describe("setCountryAccounts", () => {
  const known = (op: Op) =>
    op.table === "payment_accounts"
      ? { data: ["faysal", "paypal", "easypaisa"].filter((k) => ((filterValue(op, "in", "key") as string[] | undefined) ?? []).includes(k)).map((key) => ({ key })), error: null }
      : { data: null, error: null };
  it("replaces the list through one rpc in array order, after checking the keys exist", async () => {
    db.state.handler = known;
    await expect(setCountryAccounts("PK", ["paypal", "faysal", "easypaisa"])).resolves.toEqual({ ok: true });
    const rpcs = db.state.ops.filter((o) => o.op === "rpc");
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].table).toBe("landing_set_country_accounts");
    expect(rpcs[0].payload).toEqual({ p_region_key: "PK", p_account_keys: ["paypal", "faysal", "easypaisa"] });
    expect(db.state.ops.some((o) => o.table === "payment_country_accounts")).toBe(false);
  });
  it("the sql function writes sort = index * 10 in one transaction", () => {
    const sql = readFileSync("supabase/migrations/0082_payment_country_accounts_fn.sql", "utf8");
    expect(sql).toMatch(/\(k\.ord - 1\)::integer \* 10/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/revoke all on function public\.landing_set_country_accounts\(text, text\[\]\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.landing_set_country_accounts\(text, text\[\]\) to service_role/);
  });
  it("rejects an unknown account key without calling the rpc", async () => {
    db.state.handler = known;
    await expect(setCountryAccounts("PK", ["faysal", "ghost"])).resolves.toEqual({ ok: false });
    expect(db.state.ops.some((o) => o.op === "rpc")).toBe(false);
  });
  it("rejects duplicates, more than 12 and a bad region key without touching the database", async () => {
    await expect(setCountryAccounts("PK", ["faysal", "faysal"])).resolves.toEqual({ ok: false });
    await expect(setCountryAccounts("PK", Array.from({ length: 13 }, (_, i) => `acct_${i}`))).resolves.toEqual({ ok: false });
    await expect(setCountryAccounts("pk", ["faysal"])).resolves.toEqual({ ok: false });
    expect(db.state.ops).toHaveLength(0);
  });
  it("rejects an empty list without calling the database", async () => {
    await expect(setCountryAccounts("PK", [])).resolves.toEqual({ ok: false });
    expect(db.state.ops).toHaveLength(0);
  });
  it("the sql function rejects an empty list and locks the country row before any delete", () => {
    const sql = readFileSync("supabase/migrations/0082_payment_country_accounts_fn.sql", "utf8");
    expect(sql).toMatch(/cardinality\(v_keys\) = 0[\s\S]*?raise exception 'empty_list'/);
    const lock = sql.search(/from public\.payment_countries where region_key = p_region_key for update/);
    expect(lock).toBeGreaterThan(-1);
    expect(sql.indexOf("empty_list")).toBeLessThan(sql.search(/delete from/));
    expect(lock).toBeLessThan(sql.search(/delete from/));
  });
  it("returns ok:false (no partial write) when the function is not installed yet", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of ["PGRST202", "42883"]) {
      db.state.handler = (op) => (op.op === "rpc" ? { data: null, error: { code, message: "function missing" } } : known(op));
      await expect(setCountryAccounts("PK", ["faysal"])).resolves.toEqual({ ok: false });
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(db.state.ops.some((o) => o.table === "payment_country_accounts")).toBe(false);
  });
  it("returns ok:false when the function rejects the country, throws any other error", async () => {
    db.state.handler = (op) => (op.op === "rpc" ? { data: null, error: { code: "P0001", message: "unknown country" } } : known(op));
    await expect(setCountryAccounts("XX", ["faysal"])).resolves.toEqual({ ok: false });
    db.state.handler = (op) => (op.op === "rpc" ? { data: null, error: { code: "08006" } } : known(op));
    await expect(setCountryAccounts("PK", ["faysal"])).rejects.toMatchObject({ code: "08006" });
  });
});

describe("schemas", () => {
  it("accountCreateSchema limits rows, label and value", () => {
    expect(accountCreateSchema.safeParse(input).success).toBe(true);
    expect(accountCreateSchema.safeParse({ ...input, rows: Array.from({ length: 9 }, () => ({ label: "a", value: "b" })) }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ ...input, rows: [{ label: "a".repeat(81), value: "b" }] }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ ...input, rows: [{ label: "a", value: "b".repeat(201) }] }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ ...input, kind: "cash" }).success).toBe(false);
    expect(accountCreateSchema.safeParse({ ...input, rows: [] }).success).toBe(false);
  });
  it("accountPatchSchema takes partial fields but not an empty object", () => {
    expect(accountPatchSchema.safeParse({ active: false }).success).toBe(true);
    expect(accountPatchSchema.safeParse({}).success).toBe(false);
    expect(accountPatchSchema.safeParse({ rows: [] }).success).toBe(false);
  });
  it("countryCreateSchema and countryPatchSchema", () => {
    expect(countryCreateSchema.safeParse({ regionKey: "KSA", name: "Saudi" }).success).toBe(true);
    expect(countryCreateSchema.safeParse({ regionKey: "pk", name: "Pakistan" }).success).toBe(false);
    expect(countryCreateSchema.safeParse({ regionKey: "TOOLONG1", name: "X" }).success).toBe(false);
    expect(countryPatchSchema.safeParse({ active: false }).success).toBe(true);
    expect(countryPatchSchema.safeParse({}).success).toBe(false);
  });
  it("countryAccountsSchema rejects duplicate keys and 13 accounts", () => {
    expect(countryAccountsSchema.safeParse({ accountKeys: ["faysal", "paypal"] }).success).toBe(true);
    expect(countryAccountsSchema.safeParse({ accountKeys: ["faysal", "faysal"] }).success).toBe(false);
    expect(countryAccountsSchema.safeParse({ accountKeys: [] }).success).toBe(false);
    expect(countryAccountsSchema.safeParse({ accountKeys: Array.from({ length: 12 }, (_, i) => `acct_${i}`) }).success).toBe(true);
    expect(countryAccountsSchema.safeParse({ accountKeys: Array.from({ length: 13 }, (_, i) => `acct_${i}`) }).success).toBe(false);
  });
});
