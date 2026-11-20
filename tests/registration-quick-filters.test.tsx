// tests/registration-quick-filters.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));

import { CampaignRegistrations } from "@/components/admin/registrations/CampaignRegistrations";
import { QuickFilters } from "@/components/admin/registrations/QuickFilters";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const row = (i: number): RegistrationListRow => ({
  id: `r${i}`, refId: null, name: `Person ${i}`, email: `p${i}@x.com`, pageId: "pg1", pageTitle: "TMC",
  optionLabel: "Live - Full course", mode: "live", region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR",
  status: "paid", agentId: null, agentName: null, groupSize: 1, isTest: false,
  createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null, voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false, lastEmailAt: {}, rowType: "individual", leadId: null, leadName: null, groupId: null,
});
const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
const counts = { all: 5, pending: 0, reserved: 0, underpaid: 0, paid: 5, free: 0 };
const BASE = "/dashboard/admin/enrollments/registrations/campaign/pg1";

afterEach(cleanup);

describe("quick filters", () => {
  const filters = { status: "paid" as const, optionLabel: "Live - Old", q: "ali" };
  const params = (name: string) => new URL(screen.getByRole("link", { name }).getAttribute("href")!, "http://x").searchParams;

  it("Live full course sets live + full and clears a conflicting option label", () => {
    render(<QuickFilters basePath={BASE} filters={filters} />);
    const sp = params("Live full course");
    expect(sp.get("mode")).toBe("live");
    expect(sp.get("optionScopes")).toBe("full");
    expect(sp.get("optionLabel")).toBeNull();
    expect(sp.get("status")).toBe("paid");
    expect(sp.get("q")).toBe("ali");
  });

  it("Live + Module N uses the number typed", () => {
    render(<QuickFilters basePath={BASE} filters={filters} />);
    fireEvent.change(screen.getByLabelText("Module number (1 to 12)"), { target: { value: "7" } });
    const sp = params("Live + Module 7");
    expect(sp.get("mode")).toBe("live");
    expect(sp.get("optionScopes")).toBe("full,7");
    expect(sp.get("optionLabel")).toBeNull();
  });

  it("offers no Module link for a number outside 1 to 12", () => {
    render(<QuickFilters basePath={BASE} filters={filters} />);
    fireEvent.change(screen.getByLabelText("Module number (1 to 12)"), { target: { value: "13" } });
    expect(screen.queryByRole("link", { name: /Live \+ Module/ })).toBeNull();
  });

  it("All live sets live with no scopes", () => {
    render(<QuickFilters basePath={BASE} filters={{ ...filters, optionScopes: "full" }} />);
    const sp = params("All live");
    expect(sp.get("mode")).toBe("live");
    expect(sp.get("optionScopes")).toBeNull();
  });

  it("Enter in the module number box does not submit the surrounding form", () => {
    render(
      <form data-testid="f">
        <QuickFilters basePath={BASE} filters={filters} />
      </form>,
    );
    const input = screen.getByLabelText("Module number (1 to 12)");
    const notPrevented = fireEvent.keyDown(input, { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(fireEvent.keyDown(input, { key: "a" })).toBe(true);
  });
});

describe("Email their IDs", () => {
  it("opens the email builder with the ticked ids and the starter subject and message", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ templates: [] }) }) as Response));
    const onOpenBuilder = vi.fn();
    render(
      <CampaignRegistrations
        pageId="pg1" pageTitle="TMC" rows={rows} total={5} counts={counts}
        basePath={BASE} detailHrefBase="/dashboard/admin/enrollments/registrations"
        filters={{ pageId: "pg1", status: "all" }} query={{ status: "all" }}
        filterOptions={{ regions: ["PK"], optionLabels: [] }}
        onOpenBuilder={onOpenBuilder}
      />,
    );
    const boxes = within(screen.getByRole("table")).getAllByRole("checkbox")
      .filter((c) => c.getAttribute("aria-label") !== "Select all on this page");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[2]);
    fireEvent.click(screen.getByRole("button", { name: "Email their IDs" }));
    expect(onOpenBuilder).toHaveBeenCalledWith("email", expect.objectContaining({
      selection: { mode: "ids", ids: ["r1", "r3"] },
      starter: expect.objectContaining({ subject: "Your PZ ID" }),
    }));
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Your PZ ID");
    const message = (screen.getByLabelText("Message") as HTMLTextAreaElement).value;
    expect(message).toContain("{{first_name}}");
    expect(message).toContain("{{pz_id}}");
    expect(message).not.toMatch(/https?:/);
    vi.unstubAllGlobals();
  });
});
