import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), redirect: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { PaymentAccountsManager } from "@/components/admin/payments/PaymentAccountsManager";
import type { PaymentCountry } from "@/lib/data/landing-payment-countries";
import type { PaymentAccountFull } from "@/lib/data/landing-payment-accounts";

const A = (key: string, label: string, kind: PaymentAccountFull["kind"], active = true): PaymentAccountFull => ({
  key, label, kind, active, displayText: "", rows: [{ label: "Account title", value: `${label} title` }],
});
const ACCOUNTS = [A("faysal_bank", "Faysal Bank", "bank"), A("easypaisa", "EasyPaisa", "wallet"), A("gcash", "GCash", "wallet", false), A("paypal_intl", "PayPal International", "paypal")];
const link = (a: PaymentAccountFull, sort: number) => ({ key: a.key, label: a.label, kind: a.kind, active: a.active, sort });
const COUNTRIES: PaymentCountry[] = [
  { regionKey: "PK", name: "Pakistan", sort: 10, active: true, accounts: [link(ACCOUNTS[0], 10), link(ACCOUNTS[1], 20)] },
  { regionKey: "PH", name: "Philippines", sort: 20, active: true, accounts: [link(ACCOUNTS[3], 10), link(ACCOUNTS[2], 20)] },
  { regionKey: "LK", name: "Sri Lanka", sort: 30, active: true, accounts: [] },
];

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const lastCall = () => fetchMock().mock.calls.at(-1)! as [string, { method: string; body: string }];

beforeEach(() => {
  refresh.mockReset(); toast.success.mockReset(); toast.error.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => reply(200, { ok: true, key: "new_one" })));
});
afterEach(() => vi.unstubAllGlobals());

describe("PaymentAccountsManager list", () => {
  it("shows each country with its accounts in order, and the real totals", () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    expect(screen.getByRole("heading", { name: "Pakistan" })).toBeTruthy();
    const pk = screen.getByTestId("country-PK");
    const names = within(pk).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Faysal Bank", "EasyPaisa"]);
    expect(within(pk).getByText("2 accounts")).toBeTruthy();
    expect(screen.getByText("3 countries, 4 accounts")).toBeTruthy();
  });
  it("marks a hidden account and counts it in the country heading", () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    const ph = screen.getByTestId("country-PH");
    expect(within(ph).getByText("Hidden from students")).toBeTruthy();
    expect(within(ph).getByText("1 hidden")).toBeTruthy();
    expect(within(ph).getByRole("switch", { name: "Shown to students: GCash" }).getAttribute("aria-checked")).toBe("false");
  });
  it("shows the empty-country note with an Add account button", () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    const lk = screen.getByTestId("country-LK");
    expect(within(lk).getByText(/No accounts yet: pages use their own list/)).toBeTruthy();
    expect(within(lk).getByRole("button", { name: "Add account" })).toBeTruthy();
  });
});

describe("PaymentAccountsManager saving", () => {
  it("hiding an account patches it and refreshes", async () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    fireEvent.click(within(screen.getByTestId("country-PK")).getByRole("switch", { name: "Shown to students: Faysal Bank" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe("/api/admin/payment-accounts/faysal_bank");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ active: false });
  });
  it("moving down puts the full reordered list", async () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    fireEvent.click(within(screen.getByTestId("country-PK")).getByRole("button", { name: "Move Faysal Bank down" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe("/api/admin/payment-countries/PK/accounts");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ accountKeys: ["easypaisa", "faysal_bank"] });
  });
  it("the first account cannot move up", () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    const up = within(screen.getByTestId("country-PK")).getByRole("button", { name: "Move Faysal Bank up" }) as HTMLButtonElement;
    expect(up.disabled).toBe(true);
  });
  it("a failed save shows the server message and does not refresh", async () => {
    fetchMock().mockResolvedValue(reply(500, { error: "Could not save the account. Please try again." }));
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    fireEvent.click(within(screen.getByTestId("country-PK")).getByRole("switch", { name: "Shown to students: EasyPaisa" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save the account. Please try again."));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("adding a country posts it", async () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    fireEvent.click(screen.getByRole("button", { name: "Add country" }));
    fireEvent.change(screen.getByLabelText("Country code"), { target: { value: "ae" } });
    fireEvent.change(screen.getByLabelText("Country name"), { target: { value: "United Arab Emirates" } });
    fireEvent.click(screen.getByRole("button", { name: "Save country" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe("/api/admin/payment-countries");
    expect(JSON.parse(init.body)).toEqual({ regionKey: "AE", name: "United Arab Emirates" });
  });
  it("adding an account creates it, then adds it to the chosen country list", async () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    fireEvent.click(within(screen.getByTestId("country-LK")).getByRole("button", { name: "Add account" }));
    fireEvent.change(screen.getByLabelText("Account name"), { target: { value: "Sampath Bank" } });
    fireEvent.change(screen.getByLabelText("Detail 1 name"), { target: { value: "Account number" } });
    fireEvent.change(screen.getByLabelText("Detail 1 value"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const calls = fetchMock().mock.calls as [string, { method: string; body: string }][];
    expect(calls[0][0]).toBe("/api/admin/payment-accounts");
    expect(JSON.parse(calls[0][1].body)).toMatchObject({ label: "Sampath Bank", kind: "bank", rows: [{ label: "Account number", value: "123" }] });
    expect(calls[1][0]).toBe("/api/admin/payment-countries/LK/accounts");
    expect(JSON.parse(calls[1][1].body)).toEqual({ accountKeys: ["new_one"] });
  });
  it("editing a country can add an existing account to it", async () => {
    render(<PaymentAccountsManager countries={COUNTRIES} accounts={ACCOUNTS} />);
    fireEvent.click(within(screen.getByTestId("country-LK")).getByRole("button", { name: "Edit country" }));
    fireEvent.change(screen.getByLabelText("Add an existing account"), { target: { value: "faysal_bank" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to country" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = lastCall();
    expect(url).toBe("/api/admin/payment-countries/LK/accounts");
    expect(JSON.parse(init.body)).toEqual({ accountKeys: ["faysal_bank"] });
  });
});
