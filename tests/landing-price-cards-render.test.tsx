import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PricingCards } from "@/components/landing/sections/PricingCards";
import { DEFAULT_REGISTRATION, type RegistrationConfig } from "@/lib/landing/registration/config";
import { LINK_ALL_MODULES, LINK_GROUP } from "@/lib/landing/registration/card-price";

const register = { url: "https://x.com/r", label: "Join", closed: false };
const BEFORE = "2026-09-20T10:00:00+05:00";

function cfg(over: Partial<RegistrationConfig> = {}): RegistrationConfig {
  const mod = (pk: number, uae: number) => ({ PK: { amount: pk }, UAE: { amount: uae } });
  return {
    ...DEFAULT_REGISTRATION,
    enabled: true,
    modes: ["live", "recorded"],
    recordedPercentOfRegular: 85,
    regions: [
      { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
      { key: "UAE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
    ],
    defaultRegionKey: "PK",
    options: [
      { key: "full", label: "Complete course", kind: "bundle", free: false, waGroupUrl: "" },
      { key: "m1", label: "Module 1", kind: "module", free: false, waGroupUrl: "" },
      { key: "m2", label: "Module 2", kind: "module", free: false, waGroupUrl: "" },
    ],
    moduleMix: { enabled: true, bundleOptionKey: "full" },
    tiers: [{ key: "g3", label: "Group", minSize: 3, maxSize: 50, percentOff: 20 }],
    prices: { full: { PK: { amount: 4000, earlyAmount: 3200 }, UAE: { amount: 180, earlyAmount: 150 } }, m1: mod(1200, 50), m2: mod(1200, 50) },
    earlyBirdEndsAt: "2026-09-24T23:59:00+05:00",
    ...over,
  };
}
const item = (o: Record<string, string>) => ({ name: "", price: "", oldPrice: "", badge: "", features: "", option: "", ...o });
const page = (items: Record<string, string>[], registration?: RegistrationConfig, nowIso = BEFORE) =>
  <PricingCards data={{ heading: "Fees", items: items.map(item) }} register={register} registration={registration} nowIso={nowIso} />;

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(BEFORE)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PricingCards linked cards", () => {
  it("(a) no linked card renders today's markup, no switcher", () => {
    const { container } = render(page([{ name: "Plain", price: "PKR 100", features: "One" }], cfg()));
    expect(screen.getByText("PKR 100")).toBeTruthy();
    expect(screen.queryByText(/Prices for/)).toBeNull();
    expect(container.querySelector("select")).toBeNull();
  });

  it("(b) switcher re-prices every linked card", () => {
    render(page([{ name: "Full", option: "full" }, { name: "Mods", option: LINK_ALL_MODULES }], cfg()));
    expect(screen.getByText("PKR 3,200")).toBeTruthy();
    expect(screen.getByText("PKR 1,200")).toBeTruthy();
    const sel = screen.getByLabelText(/Prices for/) as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["Pakistan", "UAE"]);
    fireEvent.change(sel, { target: { value: "UAE" } });
    expect(screen.getByText("AED 150")).toBeTruthy();
    expect(screen.getByText("AED 50")).toBeTruthy();
    expect(screen.queryByText("PKR 3,200")).toBeNull();
  });

  it("(c) one region: currency shown, no switcher", () => {
    const c = cfg({ regions: [cfg().regions[1]], defaultRegionKey: "UAE" });
    render(page([{ name: "Full", option: "full" }], c));
    expect(screen.getByText("AED 150")).toBeTruthy();
    expect(screen.queryByLabelText(/Prices for/)).toBeNull();
  });

  it("(d) module link hides the full card and prices the modules card", () => {
    const base = cfg();
    const c = cfg({ options: [base.options[2]], moduleMix: { enabled: false, bundleOptionKey: "" }, prices: { m2: base.prices.m2 } });
    render(page([{ name: "Full card", option: "full" }, { name: "Singles", option: LINK_ALL_MODULES }], c));
    expect(screen.queryByText("Full card")).toBeNull();
    expect(screen.getByText("Singles")).toBeTruthy();
    expect(screen.getByText("PKR 1,200")).toBeTruthy();
  });

  it("(e) early bird before the cut-off, then ends on time at mount", () => {
    render(page([{ name: "Full", option: "full" }], cfg()));
    expect(screen.getByText("PKR 3,200")).toBeTruthy();
    expect(screen.getByText("PKR 4,000").className).toContain("line-through");
    expect(screen.getByText("Early Bird ends 24 September 2026")).toBeTruthy();
    cleanup();
    vi.setSystemTime(new Date("2026-09-25T10:00:00+05:00"));
    render(page([{ name: "Full", option: "full" }], cfg()));
    expect(screen.getByText("PKR 4,000").className).not.toContain("line-through");
    expect(screen.queryByText(/Early Bird ends/)).toBeNull();
    expect(screen.queryByText("PKR 3,200")).toBeNull();
  });

  it("(f) group card lists the lines", () => {
    render(page([{ name: "Groups", option: LINK_GROUP }], cfg()));
    expect(screen.getByText("Group of 3 or more: 20% off · PKR 2,560 each")).toBeTruthy();
  });

  it("(g) registration off: typed price kept, unpriced hidden, all hidden gives null", () => {
    const off = cfg({ enabled: false });
    render(page([{ name: "Typed", option: "full", price: "PKR 999" }, { name: "Bare", option: "m1" }], off));
    expect(screen.getByText("PKR 999")).toBeTruthy();
    expect(screen.queryByText("Bare")).toBeNull();
    cleanup();
    const { container } = render(page([{ name: "Bare", option: "m1" }], off));
    expect(container.innerHTML).toBe("");
  });

  it("(h) Recorded line only when both modes are offered", () => {
    render(page([{ name: "Full", option: "full" }], cfg()));
    expect(screen.getByText("Recorded: PKR 3,400")).toBeTruthy();
    cleanup();
    render(page([{ name: "Full", option: "full" }], cfg({ modes: ["live"] })));
    expect(screen.queryByText(/Recorded/)).toBeNull();
  });
});
