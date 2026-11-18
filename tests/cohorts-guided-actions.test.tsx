// Guided Cohorts page, step 3: what do you want to do, plus the page frame.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";
import { CohortsActions } from "@/components/admin/crm/CohortsActions";
import type { CohortRow } from "@/lib/data/admin-crm-import";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: async () => undefined }));
vi.mock("@/lib/data/admin-crm-import", () => ({ listCohorts: async () => [] }));

const cohort = (over: Partial<CohortRow> = {}): CohortRow => ({
  id: "c1", sheetName: "DIT Batch 1", tabName: "Tab A", rowsImported: 10, createdAt: "2026-10-12T20:30:00.000Z",
  courseId: null, courseTitle: "DIT", purchaseCount: 10, kind: "imported", contactCount: 10, ...over,
});
const area = () => screen.getByTestId("cohorts-actions");
const table = () => within(screen.getByRole("table"));

const UPLOAD = "Upload the downloaded file in Meta Ads Manager: Audiences, Create audience, Custom audience, Customer list.";
const PRIVACY = "The plain file has real emails and phone numbers. Meta scrambles it for you when you upload. Keep it private and delete it after uploading.";

describe("cohorts guided: what do you want to do", () => {
  it("has the step 3 heading", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    expect(screen.getByRole("heading", { name: "3. What do you want to do?" })).toBeTruthy();
  });

  it("with no ticks it says to tick cohorts and shows the limit hint, with no download links", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    expect(within(area()).getByText("Tick cohorts to download them")).toBeTruthy();
    expect(within(area()).getByText("You can pick up to 20 at a time.")).toBeTruthy();
    expect(within(area()).queryByRole("link")).toBeNull();
  });

  it("with two ticks it shows the count, the people total and both links", () => {
    render(<CohortsPanel initialCohorts={[cohort({ id: "a", sheetName: "One", contactCount: 10 }), cohort({ id: "b", sheetName: "Two", contactCount: 32 })]} />);
    fireEvent.click(table().getByLabelText("Select One, Tab A"));
    fireEvent.click(table().getByLabelText("Select Two, Tab A"));
    const a = within(area());
    expect(a.getByText("2 cohorts selected")).toBeTruthy();
    expect(a.getByText("Up to 42 people")).toBeTruthy();
    const meta = a.getByRole("link", { name: "Download for Meta" });
    expect(meta.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a,b");
    expect(meta.hasAttribute("download")).toBe(true);
    const plain = a.getByRole("link", { name: "Download plain version" });
    expect(plain.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a,b&format=plain");
    expect(plain.hasAttribute("download")).toBe(true);
    expect(a.getByText(UPLOAD)).toBeTruthy();
    expect(a.getByText(PRIVACY)).toBeTruthy();
    expect(a.queryByText("Tick cohorts to download them")).toBeNull();
  });

  it("one tick is singular", () => {
    render(<CohortsPanel initialCohorts={[cohort({ contactCount: 1, rowsImported: 1 })]} />);
    fireEvent.click(table().getByLabelText("Select DIT Batch 1, Tab A"));
    expect(within(area()).getByText("1 cohort selected")).toBeTruthy();
    expect(within(area()).getByText("Up to 1 person")).toBeTruthy();
  });

  it("the limit note appears at 20, with the hidden-ticks part only when some are hidden", () => {
    const rows = Array.from({ length: 21 }, (_, i) => cohort({ id: `id${i}`, sheetName: `Sheet ${i}` }));
    render(<CohortsPanel initialCohorts={rows} />);
    for (let i = 0; i < 20; i++) fireEvent.click(table().getByLabelText(`Select Sheet ${i}, Tab A`));
    expect(within(area()).getByText("You can pick at most 20 cohorts at a time.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search by sheet or tab name"), { target: { value: "Sheet 2" } });
    expect(within(area()).getByText(/including ones hidden by your search/)).toBeTruthy();
  });

  it("ticks that are all hidden by the search say so instead of asking to tick", () => {
    render(<CohortsPanel initialCohorts={[cohort({ id: "a", sheetName: "Alpha" }), cohort({ id: "b", sheetName: "Beta" }), cohort({ id: "c", sheetName: "Gamma" })]} />);
    fireEvent.click(table().getByLabelText("Select Alpha, Tab A"));
    fireEvent.click(table().getByLabelText("Select Beta, Tab A"));
    fireEvent.change(screen.getByLabelText("Search by sheet or tab name"), { target: { value: "gamma" } });
    expect(within(area()).getByText("2 ticked, hidden by your search")).toBeTruthy();
    expect(within(area()).queryByText("Tick cohorts to download them")).toBeNull();
    fireEvent.change(screen.getByLabelText("Search by sheet or tab name"), { target: { value: "beta" } });
    expect(within(area()).getByText("1 cohort selected")).toBeTruthy();
  });

  it("one hidden tick is singular", () => {
    render(<CohortsActions cohorts={[]} atLimit={false} hiddenTicks={1} />);
    expect(screen.getByText("1 ticked, hidden by your search")).toBeTruthy();
  });

  it("does not take focus on load", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("CohortsActions alone: zero visible ticks but hidden ones at the limit still shows the limit note", () => {
    render(<CohortsActions cohorts={[]} atLimit hiddenTicks={20} />);
    expect(screen.getByText(/at most 20 cohorts at a time, including ones hidden by your search/)).toBeTruthy();
  });
});

describe("cohorts guided: page frame", () => {
  it("the area is a phone bar above the bottom nav, a lg bar, capped below xl, and a sticky side card from xl", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    const cls = area().className;
    expect(cls).toContain("max-xl:sticky");
    expect(cls).toContain("bottom-[calc(4.5rem+env(safe-area-inset-bottom))]");
    expect(cls).toContain("lg:bottom-4");
    expect(cls).toContain("max-xl:max-h-[50dvh]");
    expect(cls).toContain("max-xl:overflow-y-auto");
    expect(cls).toContain("xl:sticky");
    expect(cls).toContain("xl:top-20");
    expect(cls).toContain("xl:bottom-auto");
    expect(cls).not.toMatch(/(^|\s)xl:max-h/);
  });

  it("list and card sit in one two-column grid from xl", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    const grid = area().parentElement as HTMLElement;
    expect(grid.className).toContain("xl:grid");
    expect(grid.contains(screen.getByRole("table"))).toBe(true);
  });

  it("the page intro explains the flow", async () => {
    const Page = (await import("@/app/dashboard/admin/sales-hub/cohorts/page")).default;
    render(await Page());
    expect(screen.getByText("Each imported sheet becomes a cohort. Pick the ones you want, then download them for Meta.")).toBeTruthy();
  });

  it("no cohorts means no step 3 area", () => {
    render(<CohortsPanel initialCohorts={[]} />);
    expect(screen.queryByTestId("cohorts-actions")).toBeNull();
  });
});
