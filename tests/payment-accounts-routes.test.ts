import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
const gate = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => gate.result }));
const d = vi.hoisted(() => ({
  createPaymentAccount: vi.fn(), updatePaymentAccount: vi.fn(),
  createPaymentCountry: vi.fn(), updatePaymentCountry: vi.fn(), setCountryAccounts: vi.fn(),
}));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ createPaymentAccount: d.createPaymentAccount, updatePaymentAccount: d.updatePaymentAccount }));
vi.mock("@/lib/data/landing-payment-countries", () => ({
  createPaymentCountry: d.createPaymentCountry, updatePaymentCountry: d.updatePaymentCountry, setCountryAccounts: d.setCountryAccounts,
}));

import { POST as createAccount } from "@/app/api/admin/payment-accounts/route";
import { PATCH as patchAccount } from "@/app/api/admin/payment-accounts/[key]/route";
import { POST as createCountry } from "@/app/api/admin/payment-countries/route";
import { PATCH as patchCountry } from "@/app/api/admin/payment-countries/[regionKey]/route";
import { PUT as putAccounts } from "@/app/api/admin/payment-countries/[regionKey]/accounts/route";

const req = (body: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(body) }) as never;
const acct = { label: "Faysal Bank", kind: "bank", rows: [{ label: "IBAN", value: "PK00" }], displayText: "" };
const keyCtx = { params: Promise.resolve({ key: "faysal_bank" }) };
const regCtx = { params: Promise.resolve({ regionKey: "PK" }) };

const CALLS: [string, () => Promise<Response>][] = [
  ["create account", () => createAccount(req(acct))],
  ["patch account", () => patchAccount(req({ active: false }, "PATCH"), keyCtx)],
  ["create country", () => createCountry(req({ regionKey: "LK", name: "Sri Lanka" }))],
  ["patch country", () => patchCountry(req({ name: "Pakistan" }, "PATCH"), regCtx)],
  ["put accounts", () => putAccounts(req({ accountKeys: ["faysal_bank"] }, "PUT"), regCtx)],
];

beforeEach(() => {
  for (const f of Object.values(d)) f.mockReset();
  gate.result = { ok: true, user: { id: "a" } };
});

describe("payment routes refuse non-admins", () => {
  it.each([[401, "Not authenticated"], [403, "Forbidden"]])("%s touches no data", async (code, message) => {
    for (const [name, call] of CALLS) {
      gate.result = { ok: false, response: NextResponse.json({ error: message }, { status: code }) };
      const res = await call();
      expect(res.status, name).toBe(code);
    }
    for (const [name, fn] of Object.entries(d)) expect(fn, name).not.toHaveBeenCalled();
  });
});

describe("payment routes", () => {
  it("creates an account and returns its key", async () => {
    d.createPaymentAccount.mockResolvedValue({ ok: true, key: "faysal_bank" });
    const res = await createAccount(req(acct));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ key: "faysal_bank" });
    expect(d.createPaymentAccount).toHaveBeenCalledWith(acct);
  });
  it("rejects a bad account with the first issue", async () => {
    const res = await createAccount(req({ ...acct, rows: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("rows");
    expect(d.createPaymentAccount).not.toHaveBeenCalled();
  });
  it("answers 500 with a plain message when saving fails", async () => {
    d.createPaymentAccount.mockRejectedValue(new Error("db"));
    const res = await createAccount(req(acct));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/try again/i);
  });
  it("patches an account, 404 when missing", async () => {
    d.updatePaymentAccount.mockResolvedValue({ ok: true });
    expect((await patchAccount(req({ active: false }, "PATCH"), keyCtx)).status).toBe(200);
    expect(d.updatePaymentAccount).toHaveBeenCalledWith("faysal_bank", { active: false });
    d.updatePaymentAccount.mockResolvedValue({ ok: false });
    expect((await patchAccount(req({ active: false }, "PATCH"), keyCtx)).status).toBe(404);
  });
  it("rejects an empty account patch", async () => {
    expect((await patchAccount(req({}, "PATCH"), keyCtx)).status).toBe(400);
    expect(d.updatePaymentAccount).not.toHaveBeenCalled();
  });
  it("creates a country, 409 when the code is taken, 400 on a bad code", async () => {
    d.createPaymentCountry.mockResolvedValue({ ok: true });
    expect((await createCountry(req({ regionKey: "LK", name: "Sri Lanka" }))).status).toBe(201);
    d.createPaymentCountry.mockResolvedValue({ ok: false, reason: "exists" });
    expect((await createCountry(req({ regionKey: "LK", name: "Sri Lanka" }))).status).toBe(409);
    expect((await createCountry(req({ regionKey: "lk", name: "Sri Lanka" }))).status).toBe(400);
  });
  it("patches a country, 404 when missing", async () => {
    d.updatePaymentCountry.mockResolvedValue({ ok: true });
    expect((await patchCountry(req({ active: false }, "PATCH"), regCtx)).status).toBe(200);
    expect(d.updatePaymentCountry).toHaveBeenCalledWith("PK", { active: false });
    d.updatePaymentCountry.mockResolvedValue({ ok: false });
    expect((await patchCountry(req({ active: false }, "PATCH"), regCtx)).status).toBe(404);
  });
  it("puts a country list, never empty", async () => {
    d.setCountryAccounts.mockResolvedValue({ ok: true });
    expect((await putAccounts(req({ accountKeys: ["a_b", "c_d"] }, "PUT"), regCtx)).status).toBe(200);
    expect(d.setCountryAccounts).toHaveBeenCalledWith("PK", ["a_b", "c_d"]);
    expect((await putAccounts(req({ accountKeys: [] }, "PUT"), regCtx)).status).toBe(400);
    d.setCountryAccounts.mockResolvedValue({ ok: false });
    expect((await putAccounts(req({ accountKeys: ["a_b"] }, "PUT"), regCtx)).status).toBe(404);
  });
});
