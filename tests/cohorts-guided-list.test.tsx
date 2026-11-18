// Guided Cohorts page, steps 1 and 2: find, pick, row menu, delete.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { CohortsPanel } from "@/components/admin/crm/CohortsPanel";
import type { CohortRow } from "@/lib/data/admin-crm-import";
import { toast } from "sonner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const confirmMock = vi.fn(async (_o?: unknown) => true);
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmMock }));

const cohort = (over: Partial<CohortRow> = {}): CohortRow => ({
  id: "c1", sheetName: "DIT Batch 1", tabName: "Tab A", rowsImported: 10, createdAt: "2026-10-12T20:30:00.000Z",
  courseId: null, courseTitle: "DIT", purchaseCount: 10, kind: "imported", contactCount: 10, ...over,
});
const table = () => within(screen.getByRole("table"));

beforeEach(() => {
  confirmMock.mockClear();
  confirmMock.mockImplementation(async () => true);
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("cohorts guided: find and pick", () => {
  it("shows both step headings and the labelled search box", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    expect(screen.getByRole("heading", { name: "1. Find a cohort" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2. Pick cohorts" })).toBeTruthy();
    expect(screen.getByLabelText("Search by sheet or tab name")).toBeTruthy();
  });

  it("search filters by sheet and by tab", () => {
    render(<CohortsPanel initialCohorts={[cohort({ id: "a", sheetName: "Alpha", tabName: "Red" }), cohort({ id: "b", sheetName: "Beta", tabName: "Green" })]} />);
    const box = screen.getByLabelText("Search by sheet or tab name");
    fireEvent.change(box, { target: { value: "alpha" } });
    expect(table().queryByText("Beta")).toBeNull();
    expect(table().getByText("Alpha")).toBeTruthy();
    fireEvent.change(box, { target: { value: "green" } });
    expect(table().getByText("Beta")).toBeTruthy();
    expect(table().queryByText("Alpha")).toBeNull();
  });

  it("each cohort shows sheet link, tab, course, people, imported note, Pakistan date and chip", () => {
    render(<CohortsPanel initialCohorts={[cohort({ id: "z9", contactCount: 7, rowsImported: 10, kind: "closed_paid" })]} />);
    const t = table();
    expect(t.getByRole("link", { name: "DIT Batch 1" }).getAttribute("href")).toBe("/dashboard/admin/sales-hub/cohorts/z9");
    expect(t.getByText("Tab A")).toBeTruthy();
    expect(t.getByText("DIT")).toBeTruthy();
    expect(t.getByText("7 people")).toBeTruthy();
    expect(t.getByText(/\(of 10 imported\)/)).toBeTruthy();
    expect(t.getByText("13 Oct 2026")).toBeTruthy();
    expect(t.getByText("Closed batch: paid")).toBeTruthy();
  });

  it("no course shows Course not set; one person is singular", () => {
    render(<CohortsPanel initialCohorts={[cohort({ courseTitle: null, contactCount: 1, rowsImported: 1 })]} />);
    expect(table().getByText("Course not set")).toBeTruthy();
    expect(table().getByText("1 person")).toBeTruthy();
    expect(table().queryByText(/undefined/)).toBeNull();
  });

  it("empty list shows the import link", () => {
    render(<CohortsPanel initialCohorts={[]} />);
    expect(screen.getByText("No cohorts imported yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Import a sheet" })).toBeTruthy();
  });

  it("no match shows the typed text", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    fireEvent.change(screen.getByLabelText("Search by sheet or tab name"), { target: { value: "x" } });
    expect(screen.getByText("No cohorts match")).toBeTruthy();
    expect(screen.getByText('Nothing matches "x".')).toBeTruthy();
  });

  it("caps ticks at 20 and counts ones hidden by search", () => {
    const rows = Array.from({ length: 21 }, (_, i) => cohort({ id: `id${i}`, sheetName: `Sheet ${i}` }));
    render(<CohortsPanel initialCohorts={rows} />);
    for (let i = 0; i < 20; i++) fireEvent.click(table().getByLabelText(`Select Sheet ${i}, Tab A`));
    expect((table().getByLabelText("Select Sheet 20, Tab A") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/You can pick at most 20 cohorts at a time/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search by sheet or tab name"), { target: { value: "Sheet 20" } });
    const x = table().getByLabelText("Select Sheet 20, Tab A") as HTMLInputElement;
    fireEvent.click(x);
    expect(x.checked).toBe(false);
  });
});

describe("cohorts guided: row menu", () => {
  it("opens with the two download links and Delete; Escape closes and refocuses More", () => {
    render(<CohortsPanel initialCohorts={[cohort({ id: "a" })]} />);
    const more = table().getByRole("button", { name: /More/ });
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const menu = table().getByRole("menu");
    const meta = within(menu).getByRole("menuitem", { name: "Download for Meta" });
    const plain = within(menu).getByRole("menuitem", { name: "Download plain version" });
    expect(meta.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a");
    expect(plain.getAttribute("href")).toBe("/api/admin/crm/cohorts/export?ids=a&format=plain");
    expect(meta.hasAttribute("download")).toBe(true);
    expect(plain.hasAttribute("download")).toBe(true);
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeTruthy();
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(table().queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("arrow keys wrap and Home/End jump", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    fireEvent.click(table().getByRole("button", { name: /More/ }));
    const menu = table().getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("an outside mousedown closes it", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    fireEvent.click(table().getByRole("button", { name: /More/ }));
    fireEvent.mouseDown(document.body);
    expect(table().queryByRole("menu")).toBeNull();
  });

  it("a 0-people cohort has no download links, only Delete", () => {
    render(<CohortsPanel initialCohorts={[cohort({ contactCount: 0, rowsImported: 0, purchaseCount: 0 })]} />);
    fireEvent.click(table().getByRole("button", { name: /More/ }));
    const menu = table().getByRole("menu");
    expect(within(menu).getByText("No people to download")).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: /Download/ })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });
});

describe("cohorts guided: phone cards and menu focus", () => {
  const cards = () => within(screen.getByTestId("cohort-cards"));

  it("a phone card shows sheet link, Course not set, the badge and its menu", () => {
    render(<CohortsPanel initialCohorts={[cohort({ id: "p1", courseTitle: null, kind: "closed_interested", contactCount: 3, rowsImported: 3 })]} />);
    expect(cards().getByRole("link", { name: "DIT Batch 1" }).getAttribute("href")).toBe("/dashboard/admin/sales-hub/cohorts/p1");
    expect(cards().getByText("Course not set")).toBeTruthy();
    expect(cards().getByText("Interested, not paid")).toBeTruthy();
    expect(cards().getByText("3 people", { exact: false })).toBeTruthy();
    expect(cards().getByRole("button", { name: /^More/ })).toBeTruthy();
  });

  it("a 0-people phone card menu has no download links", () => {
    render(<CohortsPanel initialCohorts={[cohort({ contactCount: 0, rowsImported: 0, purchaseCount: 0 })]} />);
    fireEvent.click(cards().getByRole("button", { name: /^More/ }));
    const menu = cards().getByRole("menu");
    expect(within(menu).getByText("No people to download")).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: /Download/ })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  it("Tab closes the menu and puts focus on More", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    const more = table().getByRole("button", { name: /More/ });
    fireEvent.click(more);
    fireEvent.keyDown(table().getByRole("menu"), { key: "Tab" });
    expect(table().queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("choosing Delete puts focus back on More, and it stays there when the confirm is cancelled", async () => {
    confirmMock.mockImplementation(async () => false);
    vi.stubGlobal("fetch", vi.fn());
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    const more = table().getByRole("button", { name: /More/ });
    fireEvent.click(more);
    fireEvent.click(within(table().getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    expect(document.activeElement).toBe(more);
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(document.activeElement).toBe(more);
    vi.unstubAllGlobals();
  });

  it("while a delete is running, the Delete item is disabled and looks it", () => {
    confirmMock.mockImplementation(() => new Promise<boolean>(() => {}));
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    const more = table().getByRole("button", { name: /More/ });
    fireEvent.click(more);
    fireEvent.click(within(table().getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(more);
    const del = within(table().getByRole("menu")).getByRole("menuitem", { name: "Deleting…" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.className).toContain("disabled:opacity-50");
    expect(del.className).toContain("disabled:cursor-not-allowed");
  });

  it("the phone card tap targets do not repeat the same min-height class", () => {
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    for (const el of Array.from(screen.getByTestId("cohort-cards").querySelectorAll("[class]"))) {
      expect(el.getAttribute("class")).not.toMatch(/max-md:min-h-11/);
    }
  });
});

describe("cohorts guided: delete", () => {
  it("asks first with the same title and warning, then deletes and drops the row", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CohortsPanel initialCohorts={[cohort({ id: "a", purchaseCount: 1 })]} />);
    fireEvent.click(table().getByRole("button", { name: /More/ }));
    fireEvent.click(within(table().getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Cohort deleted."));
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({
      title: "Delete cohort?",
      description: `"DIT Batch 1 — Tab A": 1 purchase will lose this cohort tag; the contacts and purchases themselves stay.`,
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/crm/cohorts/a", { method: "DELETE" });
    expect(screen.getByText("No cohorts imported yet")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("does not call DELETE when not confirmed", async () => {
    confirmMock.mockImplementation(async () => false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CohortsPanel initialCohorts={[cohort({ purchaseCount: 0 })]} />);
    fireEvent.click(table().getByRole("button", { name: /More/ }));
    fireEvent.click(within(table().getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ description: `"DIT Batch 1 — Tab A" has no purchases attached (safe to remove).` }));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("failure shows the error text and keeps the row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "Nope." }) })));
    render(<CohortsPanel initialCohorts={[cohort()]} />);
    fireEvent.click(table().getByRole("button", { name: /More/ }));
    fireEvent.click(within(table().getByRole("menu")).getByRole("menuitem", { name: "Delete" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Nope."));
    expect(table().getByText("DIT Batch 1")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
