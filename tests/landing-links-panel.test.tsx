import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const copyText = vi.fn(async (_text: string, _host: unknown) => true);
vi.mock("@/components/admin/landing/copy-text", () => ({ copyText: (t: string, h: unknown) => copyText(t, h) }));
vi.mock("@/components/admin/landing/variants/AddCountryDialog", () => ({ AddCountryDialog: () => null }));

import { LinksPanel } from "@/components/admin/landing/variants/LinksPanel";
import { buildLinksText } from "@/lib/landing/links-text";
import { emptyContent } from "@/lib/landing/content";
import type { VariantGridRow } from "@/lib/landing/variant-grid";
import type { PageCheck } from "@/lib/landing/page-check";

const grid: VariantGridRow[] = [
  { ref: { regionKey: "PK", moduleKey: null }, label: "Pakistan", path: "pk", variantId: "v1", enabled: true, published: true },
  { ref: { regionKey: "AE", moduleKey: null }, label: "UAE", path: "ae", variantId: "v2", enabled: true, published: true },
];
const checks: PageCheck[] = [
  { id: "country-PK", title: "Pakistan link ok", status: "pass" },
  { id: "country-AE", title: "UAE link", status: "fail", detail: "The UAE link would show prices from another country." },
];

function mount(
  blockedBy: (r: VariantGridRow) => string | null = () => null,
  onPublish: (id: string) => Promise<{ ok: boolean }> = async () => ({ ok: true }),
  rows: VariantGridRow[] = grid,
) {
  const c = emptyContent("course");
  c.registration.regions = [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
    { key: "AE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
  ];
  return render(
    <LinksPanel
      slug="ppc" pageTitle="PPC Batch 3" grid={rows} content={c} centralRegionKeys={[]} mainLive
      blockedBy={blockedBy} problems={{}} checks={checks}
      onSwitch={async () => null} onPublish={onPublish} onAddCountry={() => {}}
    />,
  );
}

beforeEach(() => copyText.mockClear());

describe("Links panel", () => {
  it("Copy all links shows a preview of the text and Copy copies it", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Copy all links" }));
    const expected = buildLinksText({
      pageTitle: "PPC Batch 3", origin: window.location.origin, slug: "ppc", mainLive: true, rows: grid,
    });
    expect(screen.getByLabelText("Text that will be copied").textContent).toBe(expected);
    fireEvent.click(screen.getByRole("button", { name: "Copy text" }));
    await waitFor(() => expect(copyText).toHaveBeenCalledTimes(1));
    expect(copyText.mock.calls[0][0]).toBe(expected);
  });
  it("Copy all links leaves out a link that is waiting for the main page", () => {
    mount((r) => (r.path === "ae" ? "Waiting for the main page" : null));
    fireEvent.click(screen.getByRole("button", { name: "Copy all links" }));
    const text = screen.getByLabelText("Text that will be copied").textContent ?? "";
    expect(text).toContain("• Pakistan:");
    expect(text).not.toContain("UAE");
  });
  it("Publish all publishes every ready link in turn and skips links that are off or waiting", async () => {
    const rows: VariantGridRow[] = [
      { ref: { regionKey: "PK", moduleKey: null }, label: "Pakistan", path: "pk", variantId: "v1", enabled: true, published: false },
      { ref: { regionKey: "AE", moduleKey: null }, label: "UAE", path: "ae", variantId: "v2", enabled: true, published: false },
      { ref: { regionKey: "IN", moduleKey: null }, label: "India", path: "in", variantId: "v3", enabled: false, published: false },
      { ref: { regionKey: "SA", moduleKey: null }, label: "Saudi Arabia", path: "ksa", variantId: "v4", enabled: true, published: false },
    ];
    const order: string[] = [];
    mount((r) => (r.path === "ksa" ? "Waiting for the main page" : null), async (id) => { order.push(id); return { ok: true }; }, rows);
    fireEvent.click(screen.getByRole("button", { name: "Publish all (2)" }));
    await waitFor(() => expect(order).toEqual(["v1", "v2"]));
  });
  it("Publish all is disabled when no link is ready", () => {
    mount(() => "Waiting for the main page");
    expect((screen.getByRole("button", { name: "Publish all (0)" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("a passing check shows a tick and a failing check shows its message on the row", () => {
    mount();
    const pk = screen.getByRole("listitem", { name: "Pakistan" });
    expect(pk.querySelector('[aria-label="Checked"]')).not.toBeNull();
    const ae = screen.getByRole("listitem", { name: "UAE" });
    expect(ae.textContent).toContain("The UAE link would show prices from another country.");
    expect(ae.querySelector('[aria-label="Checked"]')).toBeNull();
  });
});
