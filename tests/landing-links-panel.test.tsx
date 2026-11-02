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

function mount() {
  const c = emptyContent("course");
  c.registration.regions = [
    { key: "PK", label: "Pakistan", currency: "PKR", classTime: "", timezoneLabel: "", accountKeys: [] },
    { key: "AE", label: "UAE", currency: "AED", classTime: "", timezoneLabel: "", accountKeys: [] },
  ];
  return render(
    <LinksPanel
      slug="ppc" pageTitle="PPC Batch 3" grid={grid} content={c} centralRegionKeys={[]} mainLive
      blockedBy={() => null} problems={{}} checks={checks}
      onSwitch={async () => null} onPublish={async () => ({ ok: true })} onAddCountry={() => {}}
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
  it("a passing check shows a tick and a failing check shows its message on the row", () => {
    mount();
    const pk = screen.getByRole("listitem", { name: "Pakistan" });
    expect(pk.querySelector('[aria-label="Checked"]')).not.toBeNull();
    const ae = screen.getByRole("listitem", { name: "UAE" });
    expect(ae.textContent).toContain("The UAE link would show prices from another country.");
    expect(ae.querySelector('[aria-label="Checked"]')).toBeNull();
  });
});
