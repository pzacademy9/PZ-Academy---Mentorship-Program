// tests/landing-registration-admin.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import { RegistrationSetup } from "@/components/admin/landing/registration/RegistrationSetup";
import type { RegistrationStepKey } from "@/lib/landing/registration/setup-steps";
import type { RegistrationConfig } from "@/lib/landing/registration/config";
import { ppcConfig } from "./fixtures/registration-fixtures";

function Harness({ initial = ppcConfig, step: s0 = "buy", spy }: { initial?: RegistrationConfig; step?: RegistrationStepKey; spy: (r: RegistrationConfig) => void }) {
  const [r, setR] = useState(initial);
  const [step, setStep] = useState<RegistrationStepKey>(s0);
  return <RegistrationSetup registration={r} step={step} onStep={setStep} onChange={(n) => { spy(n); setR(n); }} />;
}
const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as RegistrationConfig;

beforeEach(() => { vi.stubGlobal("open", vi.fn()); });

describe("RegistrationSetup", () => {
  it("turns the built-in form on and off with a labelled switch", () => {
    const spy = vi.fn();
    render(<Harness initial={{ ...ppcConfig, enabled: false }} spy={spy} />);
    const sw = screen.getByRole("switch", { name: /use the built-in registration form/i });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(last(spy).enabled).toBe(true);
  });
  it("moves between steps from the stepper and with Next step / Back", () => {
    render(<Harness spy={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "What people can buy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^3 prices by country/i }));
    expect(screen.getByRole("heading", { name: "Prices by country" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));
    expect(screen.getByRole("heading", { name: "Early Bird" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("heading", { name: "Prices by country" })).toBeTruthy();
  });
  it("shows a problem count on a step that has problems", () => {
    const bad = { ...ppcConfig, regions: ppcConfig.regions.map((g) => (g.key === "KSA" ? { ...g, accountKeys: ["Bad Key"] } : g)) };
    render(<Harness initial={bad} spy={vi.fn()} />);
    const btn = screen.getByRole("button", { name: /^5 payment accounts/i });
    expect(within(btn).getByText(/^\d+$/)).toBeTruthy();
    expect(within(screen.getByRole("button", { name: /^1 what people can buy/i })).queryByText(/^\d+$/)).toBeNull();
  });
  it("adds a module option", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: /add a module/i }));
    expect(last(spy).options).toHaveLength(4);
    expect(last(spy).options[3].kind).toBe("module");
  });
  it("edits a price cell and removes it when cleared", () => {
    const spy = vi.fn();
    render(<Harness step="prices" spy={spy} />);
    const cell = screen.getByLabelText("Full Course regular price in Pakistan") as HTMLInputElement;
    expect(cell.value).toBe("6000");
    fireEvent.change(cell, { target: { value: "6500" } });
    expect(last(spy).prices.full.PK).toEqual({ amount: 6500, earlyAmount: 4800 });
    fireEvent.change(screen.getByLabelText("Full Course Early Bird price in Pakistan"), { target: { value: "" } });
    expect(last(spy).prices.full.PK).toEqual({ amount: 6500 });
    const regular = screen.getByLabelText("Full Course regular price in Pakistan");
    fireEvent.change(regular, { target: { value: "" } });
    fireEvent.blur(regular);
    expect(last(spy).prices.full.PK).toBeUndefined();
  });
  it("copies a whole row of prices from another country", () => {
    const spy = vi.fn();
    const changed = { ...ppcConfig, prices: { ...ppcConfig.prices, full: { ...ppcConfig.prices.full, KSA: { amount: 1 } } } };
    render(<Harness initial={changed} step="prices" spy={spy} />);
    fireEvent.change(screen.getByLabelText("Copy prices into Saudi Arabia from"), { target: { value: "UAE" } });
    expect(last(spy).prices.full.KSA).toEqual(ppcConfig.prices.full.UAE);
  });
  it("stores the Early Bird end as an ISO instant with the chosen offset", () => {
    const spy = vi.fn();
    render(<Harness initial={{ ...ppcConfig, earlyBirdEndsAt: "" }} step="earlybird" spy={spy} />);
    fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "+04:00" } });
    fireEvent.change(screen.getByLabelText("Early Bird ends"), { target: { value: "2026-10-15T23:59" } });
    expect(last(spy).earlyBirdEndsAt).toBe("2026-10-15T23:59:00+04:00");
    fireEvent.click(screen.getByRole("button", { name: /clear early bird/i }));
    expect(last(spy).earlyBirdEndsAt).toBe("");
  });
  it("shows one read-only line per country and no account checkboxes", () => {
    render(<Harness step="accounts" spy={vi.fn()} />);
    expect(screen.getByText("Payment accounts for Saudi Arabia are managed on the Payment accounts screen.")).toBeTruthy();
    expect(screen.getByText("Payment accounts for Pakistan are managed on the Payment accounts screen.")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("validates WhatsApp group links, enables Test link only for a valid one, and reminds about approvals", () => {
    const spy = vi.fn();
    render(<Harness step="whatsapp" spy={spy} />);
    expect(screen.getByText(/approve new members/i)).toBeTruthy();
    const field = screen.getByLabelText("WhatsApp group link for Module 2");
    fireEvent.change(field, { target: { value: "https://example.com/x" } });
    expect(screen.getByText(/paste a whatsapp group invite link/i)).toBeTruthy();
    const tests = screen.getAllByRole("button", { name: /test link/i });
    expect((tests[2] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(tests[0]);
    expect(window.open).toHaveBeenCalledWith("https://chat.whatsapp.com/IGAWff910JFIzNCw42qGle", "_blank", "noopener,noreferrer");
  });
  it("warns when an option has no WhatsApp group link", () => {
    const noLink = { ...ppcConfig, options: ppcConfig.options.map((o) => (o.key === "m2" ? { ...o, waGroupUrl: "" } : o)) };
    render(<Harness initial={noLink} step="whatsapp" spy={vi.fn()} />);
    expect(screen.getByText(/people who choose module 2 won't see a join button/i)).toBeTruthy();
  });
  it("links to the promo codes screen", () => {
    render(<Harness step="promo" spy={vi.fn()} />);
    expect(screen.getByRole("link", { name: /open promo codes/i }).getAttribute("href")).toBe("/dashboard/admin/landing-promo-codes");
  });
  it("uppercases the reference prefix and previews the reference", () => {
    const spy = vi.fn();
    render(<Harness step="details" spy={spy} />);
    fireEvent.change(screen.getByLabelText("Reference prefix"), { target: { value: "mdc" } });
    expect(last(spy).refPrefix).toBe("MDC");
    expect(screen.getByText("PZA-MDC-001")).toBeTruthy();
  });
});

describe("RegistrationSetup carry-overs", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-14T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("warns when the Early Bird end is within 48 hours, and when it has passed", () => {
    const { unmount } = render(<Harness spy={vi.fn()} />);
    expect(screen.getByText(/early bird ends in less than 48 hours/i)).toBeTruthy();
    unmount();
    render(<Harness initial={{ ...ppcConfig, earlyBirdEndsAt: "2026-10-01T00:00:00+05:00" }} spy={vi.fn()} />);
    expect(screen.getByText(/early bird end time has already passed/i)).toBeTruthy();
  });
  it("shows no Early Bird warning when the end is far away or unset", () => {
    const { unmount } = render(<Harness initial={{ ...ppcConfig, earlyBirdEndsAt: "2026-12-01T00:00:00+05:00" }} spy={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
    render(<Harness initial={{ ...ppcConfig, earlyBirdEndsAt: "" }} spy={vi.fn()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("rounds fractional prices to whole numbers", () => {
    const spy = vi.fn();
    render(<Harness step="prices" spy={spy} />);
    fireEvent.change(screen.getByLabelText("Full Course regular price in Pakistan"), { target: { value: "6500.6" } });
    expect(last(spy).prices.full.PK.amount).toBe(6501);
  });
});

describe("RegistrationSetup fix round 1", () => {
  it("keeps the instant when the Early Bird time zone changes", () => {
    for (const offset of ["+05:30", "+05:00", "+00:00"]) {
      const spy = vi.fn();
      const { unmount } = render(<Harness step="earlybird" spy={spy} />);
      fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: offset } });
      expect(Date.parse(last(spy).earlyBirdEndsAt)).toBe(Date.parse(ppcConfig.earlyBirdEndsAt));
      expect(last(spy).earlyBirdEndsAt.endsWith(offset)).toBe(true);
      unmount();
    }
  });
  it("clearing and retyping a Regular price keeps its Early Bird price and exact group totals", () => {
    const spy = vi.fn();
    const withTotals = { ...ppcConfig, prices: { ...ppcConfig.prices, full: { ...ppcConfig.prices.full, PK: { amount: 6000, earlyAmount: 4800, groupTotals: { group3: 15000 }, earlyGroupTotals: { group3: 11500 } } } } };
    render(<Harness initial={withTotals} step="prices" spy={spy} />);
    const regular = screen.getByLabelText("Full Course regular price in Pakistan") as HTMLInputElement;
    fireEvent.change(regular, { target: { value: "" } });
    expect(regular.value).toBe("");
    fireEvent.change(regular, { target: { value: "7000" } });
    fireEvent.blur(regular);
    expect(last(spy).prices.full.PK).toEqual({ amount: 7000, earlyAmount: 4800, groupTotals: { group3: 15000 }, earlyGroupTotals: { group3: 11500 } });
  });
  it("clamps money to the schema maximum and caps text length", () => {
    const spy = vi.fn();
    render(<Harness step="prices" spy={spy} />);
    fireEvent.change(screen.getByLabelText("Full Course regular price in Pakistan"), { target: { value: "99999999999" } });
    expect(last(spy).prices.full.PK.amount).toBe(10_000_000);
    expect((screen.getByLabelText("Country name for PK") as HTMLInputElement).maxLength).toBe(80);
  });
  it("links the WhatsApp link field to its error or warning with aria-describedby", () => {
    const noLink = { ...ppcConfig, options: ppcConfig.options.map((o) => (o.key === "m2" ? { ...o, waGroupUrl: "" } : o)) };
    const { unmount } = render(<Harness initial={noLink} step="whatsapp" spy={vi.fn()} />);
    const field = screen.getByLabelText("WhatsApp group link for Module 2");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)!.textContent).toMatch(/won't see a join button/i);
    unmount();
    render(<Harness step="whatsapp" spy={vi.fn()} />);
    const f2 = screen.getByLabelText("WhatsApp group link for Module 2");
    fireEvent.change(f2, { target: { value: "https://example.com/x" } });
    expect(document.getElementById(f2.getAttribute("aria-describedby")!)!.textContent).toMatch(/paste a whatsapp group invite link/i);
  });
});
