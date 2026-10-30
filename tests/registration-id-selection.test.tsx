// tests/registration-id-selection.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const act = vi.hoisted(() => ({ getSelectionIdList: vi.fn() }));
vi.mock("@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions", () => ({ getSelectionIdList: act.getSelectionIdList }));

import { CampaignRegistrations } from "@/components/admin/registrations/CampaignRegistrations";
import { QuickFilters } from "@/components/admin/registrations/QuickFilters";
import type { RegistrationListRow } from "@/lib/data/landing-registration-admin";

const row = (i: number): RegistrationListRow => ({
  id: `r${i}`, refId: null, name: `Person ${i}`, email: `p${i}@x.com`, pageId: "pg1", pageTitle: "TMC",
  optionLabel: "Live - Full course", mode: "live", region: "PK", expectedAmount: 100, amountReceived: null, currency: "PKR",
  status: "paid", agentId: null, agentName: null, groupSize: 1, isTest: false,
  createdAt: "2026-10-01T10:00:00Z", statusChangedAt: null, voucherUrl: null, whatsapp: "", sheetUpdateWaiting: false, lastEmailAt: {},
});
const rows = Array.from({ length: 5 }, (_, i) => row(i + 1));
const counts = { all: 5, pending: 0, reserved: 0, underpaid: 0, paid: 5, free: 0 };
const BASE = "/dashboard/admin/enrollments/registrations/campaign/pg1";

function setup(over: Partial<Parameters<typeof CampaignRegistrations>[0]> = {}) {
  render(
    <CampaignRegistrations
      pageId="pg1" pageTitle="TMC" rows={rows} total={5} pageSize={25} counts={counts}
      basePath={BASE} detailHrefBase="/dashboard/admin/enrollments/registrations"
      filters={{ pageId: "pg1", status: "all" }} query={{ status: "all" }}
      filterOptions={{ regions: ["PK"], optionLabels: [] }}
      {...over}
    />,
  );
}
const rowBoxes = () =>
  within(screen.getByRole("table")).getAllByRole("checkbox").filter((c) => c.getAttribute("aria-label") !== "Select all on this page") as HTMLInputElement[];
const idButton = () => screen.getByRole("button", { name: /^Download IDs/ });

beforeEach(() => {
  act.getSelectionIdList.mockReset();
  act.getSelectionIdList.mockResolvedValue([]);
});

describe("ID PDF button", () => {
  it("says whole batch when nothing is ticked and no filter is set", () => {
    setup();
    expect(idButton().textContent).toBe("Download IDs (whole batch)");
    expect(screen.getByText("People without an ID yet are left out.")).toBeTruthy();
  });
  it("says filtered when a filter is active", () => {
    setup({ filters: { pageId: "pg1", status: "all", mode: "live" }, query: { status: "all", mode: "live" } });
    expect(idButton().textContent).toBe("Download IDs (filtered)");
  });
  it("shows the number ticked and changes as rows are ticked", () => {
    setup();
    fireEvent.click(rowBoxes()[0]);
    expect(idButton().textContent).toBe("Download IDs (1 selected)");
    fireEvent.click(rowBoxes()[1]);
    fireEvent.click(rowBoxes()[2]);
    expect(idButton().textContent).toBe("Download IDs (3 selected)");
  });
  it("asks for the right selection: null for the whole batch, ids when ticked", async () => {
    setup();
    fireEvent.click(idButton());
    await waitFor(() => expect(act.getSelectionIdList).toHaveBeenCalledWith("pg1", null));
    fireEvent.click(rowBoxes()[0]);
    fireEvent.click(rowBoxes()[2]);
    fireEvent.click(idButton());
    await waitFor(() => expect(act.getSelectionIdList).toHaveBeenLastCalledWith("pg1", { mode: "ids", ids: ["r1", "r3"] }));
  });
  it("sends the filter when a filter is active and nothing is ticked", async () => {
    const filters = { pageId: "pg1", status: "all" as const, optionScopes: ["full" as const, 1] };
    setup({ filters, query: { status: "all", optionScopes: "full,1" } });
    fireEvent.click(idButton());
    await waitFor(() => expect(act.getSelectionIdList).toHaveBeenCalledWith("pg1", { mode: "filter", filters }));
  });
  it("tells the owner when no one in the selection has an ID", async () => {
    setup();
    fireEvent.click(idButton());
    expect(await screen.findByText("No one in this selection has a PZ ID yet.")).toBeTruthy();
  });
});

describe("quick filters", () => {
  const filters = { status: "paid", optionLabel: "Live - Old", q: "ali" };
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
});
