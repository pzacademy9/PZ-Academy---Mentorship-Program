import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup, act } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { SheetSyncPanel } from "@/components/admin/registrations/SheetSyncPanel";

type Status = Parameters<typeof SheetSyncPanel>[0]["status"];

const PAGE = "11111111-1111-4111-8111-111111111111";
const R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function status(over: Partial<Status> = {}): Status {
  return {
    pageId: PAGE,
    state: "report",
    lastScannedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    waiting: 3,
    report: [
      { logId: "l1", registrationId: R1, name: "Farooq Tariq", field: "status", sheetValue: "paid", appValue: "pending" },
      { logId: "l2", registrationId: R2, name: "Ayesha Siddiqui", field: "email", sheetValue: "a@new.com", appValue: "a@old.com" },
    ],
    problems: [
      { rowNumber: 7, refId: "DIA-0042", field: "row", outcome: "unknown-row", detail: "This row does not match any registration on the page" },
      { rowNumber: 9, refId: "DIA-0051", field: "status", outcome: "rejected", detail: "The status in the sheet is not one the app can set" },
    ],
    ...over,
  };
}

function setup(over: Partial<Status> = {}, hasSheet = true) {
  return render(<SheetSyncPanel pageId={PAGE} pageTitle="PPC Batch 3" hasSheet={hasSheet} status={hasSheet ? status(over) : null} />);
}

const fetchMock = vi.fn();
beforeEach(() => { refresh.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const jsonRes = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
const body = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

describe("SheetSyncPanel", () => {
  it("shows the waiting count and when the sheet was last checked", () => {
    setup();
    expect(screen.getByText("Waiting: 3")).toBeTruthy();
    expect(screen.getByText(/checked 3 minutes ago/i)).toBeTruthy();
  });

  it("says so when the sheet was never checked", () => {
    setup({ lastScannedAt: null, waiting: 0 });
    expect(screen.getByText(/not checked yet/i)).toBeTruthy();
  });

  it("starts with every difference ticked and posts exactly the ticked keys", async () => {
    fetchMock.mockReturnValue(jsonRes({ applied: 2, keptApp: 0 }));
    setup();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /approve 2 changes/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-sheet-sync/approve");
    expect(body(fetchMock.mock.calls[0])).toEqual({
      pageId: PAGE,
      applyKeys: [{ registrationId: R1, field: "status" }, { registrationId: R2, field: "email" }],
    });
  });

  it("unticking a row removes its key and updates the button", async () => {
    fetchMock.mockReturnValue(jsonRes({ applied: 1, keptApp: 1 }));
    setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: /approve 1 change$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(body(fetchMock.mock.calls[0]).applyKeys).toEqual([{ registrationId: R1, field: "status" }]);
    expect(await screen.findByText("Done. 1 changes applied, 1 kept as in the app.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("disables the approve button while the request is in flight", async () => {
    let release: (v: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((r) => { release = r; }));
    setup();
    const btn = screen.getByRole("button", { name: /approve 2 changes/i }) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(btn.disabled).toBe(true));
    fireEvent.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true, json: () => Promise.resolve({ applied: 2, keptApp: 0 }) } as Response); });
  });

  it("shows the plain error text when approving fails", async () => {
    fetchMock.mockReturnValue(jsonRes({ error: "Could not finish the approval. Nothing was switched on; please try again." }, false));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /approve 2 changes/i }));
    expect(await screen.findByText(/Could not finish the approval/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /approve 2 changes/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides the review card once the page is live but keeps the status line and problems", () => {
    setup({ state: "live", report: [] });
    expect(screen.queryByText(/the sheet and the app are different/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
    expect(screen.getByText("Waiting: 3")).toBeTruthy();
    expect(screen.getByText(/needs attention/i)).toBeTruthy();
  });

  it("shows the empty state when nothing differs", () => {
    setup({ report: [], problems: [], waiting: 0 });
    expect(screen.getByText("Everything matches. Sheet and app agree.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("shows a plain message when the page has no sheet", () => {
    setup({}, false);
    expect(screen.getByText("This page has no sheet yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /scan now/i })).toBeNull();
  });

  it("lists problems with their reasons and no action buttons that do nothing", () => {
    setup();
    expect(screen.getByText("This row does not match any registration on the page")).toBeTruthy();
    expect(screen.getByText("The status in the sheet is not one the app can set")).toBeTruthy();
    expect(screen.getByText(/row 7/i)).toBeTruthy();
    expect(screen.getByText(/DIA-0042/)).toBeTruthy();
    for (const name of [/import as new/i, /ignore row/i, /resolve/i, /view both/i, /retry update/i, /dismiss/i, /^ignore$/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("Scan now posts to the scan route and shows the reply", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockReturnValue(jsonRes({ message: "Scan requested. Results appear in a minute." }));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /scan now/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-sheet-sync/scan");
    expect(body(fetchMock.mock.calls[0])).toEqual({ pageId: PAGE });
    expect(await screen.findByText("Scan requested. Results appear in a minute.")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(refresh).toHaveBeenCalled();
  });

  it("Retry uses the same scan route", async () => {
    fetchMock.mockReturnValue(jsonRes({ error: "Could not ask Google Sheets to check the sheet: no reply" }, false));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-sheet-sync/scan"));
    expect(await screen.findByText(/no reply/)).toBeTruthy();
  });

  it("uses the owner's words and never the technical ones", () => {
    const { container } = setup();
    const text = container.textContent ?? "";
    expect(within(container).getAllByText("Use sheet value").length).toBeGreaterThan(0);
    expect(text).toMatch(/Keep app value/);
    expect(text).not.toMatch(/snapshot|webhook|variant|override|resolve|schema|yaml/i);
  });

  it("offers to start keeping the sheet up to date when the first scan found no differences", async () => {
    fetchMock.mockReturnValue(jsonRes({ applied: 0, keptApp: 0 }));
    setup({ report: [], problems: [], waiting: 0 });
    fireEvent.click(screen.getByRole("button", { name: /start keeping the sheet up to date/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-sheet-sync/approve");
    expect(body(fetchMock.mock.calls[0])).toEqual({ pageId: PAGE, applyKeys: [] });
    expect(await screen.findByText("Done. The sheet is now kept up to date.")).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the start button below the problems when nothing differs but problems exist", () => {
    setup({ report: [] });
    expect(screen.getByRole("button", { name: /start keeping the sheet up to date/i })).toBeTruthy();
    expect(screen.queryByText("Everything matches. Sheet and app agree.")).toBeNull();
  });

  it("never claims a match before the first check, in either state", () => {
    for (const state of ["report", "live"] as const) {
      cleanup();
      setup({ state, report: [], problems: [], lastScannedAt: null, waiting: 0 });
      expect(screen.getByText("Not checked yet. Press Scan now.")).toBeTruthy();
      expect(screen.queryByText(/everything matches/i)).toBeNull();
      expect(screen.queryByRole("button", { name: /start keeping/i })).toBeNull();
    }
  });

  it("does not offer the start button once the page is live", () => {
    setup({ state: "live", report: [], problems: [] });
    expect(screen.getByText("Everything matches. Sheet and app agree.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start keeping/i })).toBeNull();
  });
});
