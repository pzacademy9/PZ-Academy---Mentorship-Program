// tests/cohorts-panel-meta.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";
import type { CohortRow } from "@/lib/data/admin-crm-import";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

const cohort = (over: Partial<CohortRow> = {}): CohortRow => ({
  id: "c1", sheetName: "DIT Batch 1", tabName: "Tab A", rowsImported: 10, createdAt: "2026-10-01T10:00:00Z",
  courseId: null, courseTitle: "DIT", purchaseCount: 10, kind: "imported", contactCount: 10, ...over,
});
const view = (rows: CohortRow[]) => {
  render(<CohortsPanel initialCohorts={rows} />);
  return within(screen.getByRole("table"));
};
const toolbar = () => screen.getByTestId("meta-toolbar");

describe("cohorts panel: download for Meta", () => {
  it("each row has a Download for Meta link with the right href", () => {
    const t = view([cohort({ id: "a" }), cohort({ id: "b", sheetName: "Other" })]);
    const links = t.getAllByRole("link", { name: /Download for Meta/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/api/admin/crm/cohorts/export?ids=a",
      "/api/admin/crm/cohorts/export?ids=b",
    ]);
    expect(links[0].hasAttribute("download")).toBe(true);
  });

  it("nothing ticked leaves the toolbar button disabled", () => {
    view([cohort()]);
    const btn = within(toolbar()).getByRole("button", { name: /Download selected for Meta \(0\)/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Upload the downloaded file in Meta Ads Manager/)).toBeTruthy();
  });

  it("ticking two rows enables the selected link carrying both ids", () => {
    const t = view([cohort({ id: "a", sheetName: "One" }), cohort({ id: "b", sheetName: "Two" })]);
    fireEvent.click(t.getByLabelText("Select One, Tab A"));
    fireEvent.click(t.getByLabelText("Select Two, Tab A"));
    const link = within(toolbar()).getByRole("link", { name: /Download selected for Meta \(2\)/ });
    expect(link.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a,b");
  });

  it("interested cohort shows its badge and people count", () => {
    const t = view([cohort({ id: "i", kind: "closed_interested", contactCount: 42, purchaseCount: 0, rowsImported: 42 })]);
    expect(t.getByText("Interested, not paid")).toBeTruthy();
    expect(t.getByText("42 people")).toBeTruthy();
  });

  it("closed paid cohort shows its badge", () => {
    const t = view([cohort({ kind: "closed_paid" })]);
    expect(t.getByText("Closed batch: paid")).toBeTruthy();
  });

  it("prevents a 21st tick", () => {
    const rows = Array.from({ length: 21 }, (_, i) => cohort({ id: `id${i}`, sheetName: `Sheet ${i}` }));
    const t = view(rows);
    for (let i = 0; i < 20; i++) fireEvent.click(t.getByLabelText(`Select Sheet ${i}, Tab A`));
    const last = t.getByLabelText("Select Sheet 20, Tab A") as HTMLInputElement;
    expect(last.disabled).toBe(true);
    fireEvent.click(last);
    expect(within(toolbar()).getByRole("link", { name: /\(20\)/ })).toBeTruthy();
    expect(screen.getByText(/most 20/)).toBeTruthy();
  });

  it("deleting a ticked cohort drops it from the selection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const t = view([cohort({ id: "a", sheetName: "One" }), cohort({ id: "b", sheetName: "Two" })]);
    fireEvent.click(t.getByLabelText("Select One, Tab A"));
    fireEvent.click(t.getByLabelText("Select Two, Tab A"));
    fireEvent.click(t.getAllByRole("button", { name: "delete" })[0]);
    await waitFor(() => expect(within(toolbar()).getByRole("link", { name: /\(1\)/ })).toBeTruthy());
    expect(within(toolbar()).getByRole("link", { name: /\(1\)/ }).getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=b");
    vi.unstubAllGlobals();
  });

  it("hidden-by-search ticks are not counted, and return when search clears", () => {
    const t = view([cohort({ id: "a", sheetName: "Alpha" }), cohort({ id: "b", sheetName: "Beta" })]);
    fireEvent.click(t.getByLabelText("Select Alpha, Tab A"));
    fireEvent.click(t.getByLabelText("Select Beta, Tab A"));
    const search = screen.getByPlaceholderText(/Search by sheet/);
    fireEvent.change(search, { target: { value: "alpha" } });
    const link = within(toolbar()).getByRole("link", { name: /\(1\)/ });
    expect(link.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a");
    fireEvent.change(search, { target: { value: "" } });
    const back = within(toolbar()).getByRole("link", { name: /\(2\)/ });
    expect(back.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a,b");
  });

  it("hidden ticks still count toward the cap of 20", () => {
    const rows = Array.from({ length: 21 }, (_, i) => cohort({ id: `id${i}`, sheetName: `Sheet ${i}` }));
    const t = view(rows);
    for (let i = 0; i < 20; i++) fireEvent.click(t.getByLabelText(`Select Sheet ${i}, Tab A`));
    const search = screen.getByPlaceholderText(/Search by sheet/);
    fireEvent.change(search, { target: { value: "Sheet 20" } });
    const x = t.getByLabelText("Select Sheet 20, Tab A") as HTMLInputElement;
    fireEvent.click(x);
    expect(x.checked).toBe(false);
    expect(screen.getByText(/including ones hidden by your search/)).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    const link = within(toolbar()).getByRole("link", { name: /\(20\)/ });
    expect(link.getAttribute("href")?.split("=")[1].split(",")).toHaveLength(20);
  });
});
