// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SectionForm } from "@/components/admin/landing/SectionForm";
import { DEFAULT_REGISTRATION, type RegistrationConfig } from "@/lib/landing/registration/config";
import { priceLinkChoices } from "@/lib/landing/registration/card-price";

vi.mock("@/components/admin/program/ImageUploadField", () => ({ ImageUploadField: () => <button type="button">Fake pick file</button> }));
afterEach(() => cleanup());

const reg: RegistrationConfig = {
  ...DEFAULT_REGISTRATION,
  enabled: true,
  modes: ["live"],
  regions: [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
    { key: "UAE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
  ],
  defaultRegionKey: "PK",
  options: [{ key: "full", label: "Complete Course", kind: "bundle", free: false, waGroupUrl: "", moduleIds: [] }],
  tiers: [],
  prices: { full: { PK: { amount: 3200 }, UAE: { amount: 150 } } },
};

const item = (over: Record<string, unknown> = {}) => ({ name: "A", option: "", price: "PKR 1", oldPrice: "", badge: "", features: "", ...over });
const data = (items: unknown[]) => ({ heading: "", note: "", items });

describe("Linked to field", () => {
  it("lists Not linked first, then the choices, and reports the pick", () => {
    const onChange = vi.fn();
    render(<SectionForm type="pricing_cards" data={data([item()])} onChange={onChange} registration={reg} />);
    const sel = screen.getByLabelText("Linked to") as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.text)).toEqual(["Not linked (type a price)", ...priceLinkChoices(reg).map((c) => c.label)]);
    fireEvent.change(sel, { target: { value: "full" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0][0].items as { option: string }[])[0].option).toBe("full");
  });
  it("linked card replaces the Price box with automatic text and a preview", () => {
    render(<SectionForm type="pricing_cards" data={data([item({ option: "full", price: "" })])} onChange={() => {}} registration={reg} />);
    expect(screen.queryByLabelText("Price")).toBeNull();
    expect(screen.getByText("Automatic, from Prices by country")).toBeTruthy();
    expect(screen.getByText("Today for Pakistan: PKR 3,200")).toBeTruthy();
  });
  it("linked card hides the crossed-out old price box; unlinked keeps it", () => {
    const { unmount } = render(<SectionForm type="pricing_cards" data={data([item({ option: "full", price: "" })])} onChange={() => {}} registration={reg} />);
    expect(screen.queryByLabelText(/Crossed-out old price/)).toBeNull();
    unmount();
    render(<SectionForm type="pricing_cards" data={data([item()])} onChange={() => {}} registration={reg} />);
    expect(screen.getByLabelText(/Crossed-out old price/)).toBeTruthy();
  });
  it("unlinked card keeps the typed Price box and no automatic text", () => {
    render(<SectionForm type="pricing_cards" data={data([item()])} onChange={() => {}} registration={reg} />);
    expect(screen.getByLabelText("Price")).toBeTruthy();
    expect(screen.queryByText("Automatic, from Prices by country")).toBeNull();
  });
});
