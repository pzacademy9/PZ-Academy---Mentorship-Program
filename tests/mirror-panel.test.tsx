import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

import { MirrorPanel } from "@/components/admin/registrations/MirrorPanel";

type Result = NonNullable<Parameters<typeof MirrorPanel>[0]["lastResult"]>;

const PAGE = "11111111-1111-4111-8111-111111111111";
const minutesAgo = (n: number) => new Date(Date.now() - n * 60 * 1000).toISOString();

function result(over: Partial<Result> = {}): Result {
  return {
    ok: true, preview: false, inserted: 2, changed: 1, linked: 0, skipped: 0,
    problems: [], notes: [], ranAt: minutesAgo(4), ...over,
  };
}

const fetchMock = vi.fn();
beforeEach(() => { refresh.mockReset(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => cleanup());

const jsonRes = (body: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
const body = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

describe("MirrorPanel", () => {
  it("explains what it does and that it sends no emails", () => {
    render(<MirrorPanel pageId={PAGE} lastRunAt={null} lastResult={null} />);
    expect(screen.getByText(/copies new sign-ups and status changes from the old sheet\. it sends no emails\./i)).toBeTruthy();
    expect(screen.getByText(/not synced yet/i)).toBeTruthy();
  });

  it("shows the plain summary of the last run", () => {
    render(<MirrorPanel pageId={PAGE} lastRunAt={minutesAgo(4)} lastResult={result()} />);
    expect(screen.getByText(/synced from sheet 4 minutes ago: 2 new, 1 changed, 0 problems/i)).toBeTruthy();
  });

  it("shows a red failure line when the last run failed", () => {
    render(<MirrorPanel pageId={PAGE} lastRunAt={minutesAgo(4)} lastResult={result({ ok: false, error: "Could not start" })} />);
    const line = screen.getByText(/could not read the sheet/i);
    expect(line.className).toMatch(/text-pz-error/);
  });

  it("lists problems as rows and caps the list at 20", () => {
    const problems = Array.from({ length: 23 }, (_, i) => ({ rowNumber: i + 2, reason: `Reason ${i + 2}` }));
    render(<MirrorPanel pageId={PAGE} lastRunAt={minutesAgo(1)} lastResult={result({ problems })} />);
    expect(screen.getByText("Row 2: Reason 2")).toBeTruthy();
    expect(screen.getByText("Row 21: Reason 21")).toBeTruthy();
    expect(screen.queryByText("Row 22: Reason 22")).toBeNull();
    expect(screen.getByText(/and 3 more/i)).toBeTruthy();
  });

  it("shows notes as a quiet list", () => {
    render(<MirrorPanel pageId={PAGE} lastRunAt={minutesAgo(1)} lastResult={result({ notes: ["3 rows had no email"] })} />);
    expect(screen.getByText("3 rows had no email")).toBeTruthy();
  });

  it("Sync now posts a real run, then refreshes the page", async () => {
    fetchMock.mockReturnValue(jsonRes(result()));
    render(<MirrorPanel pageId={PAGE} lastRunAt={null} lastResult={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/landing-mirror/sync");
    expect(body(fetchMock.mock.calls[0])).toEqual({ pageId: PAGE, preview: false });
  });

  it("Preview posts preview:true, shows 'Would add' counts and does not refresh", async () => {
    fetchMock.mockReturnValue(jsonRes(result({ preview: true, inserted: 2, changed: 1 })));
    render(<MirrorPanel pageId={PAGE} lastRunAt={null} lastResult={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview (changes nothing)" }));
    await waitFor(() => expect(screen.getByText(/would add 2, change 1/i)).toBeTruthy());
    expect(body(fetchMock.mock.calls[0])).toEqual({ pageId: PAGE, preview: true });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables both buttons while a run is in progress", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((res) => { finish = res; }));
    render(<MirrorPanel pageId={PAGE} lastRunAt={null} lastResult={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /preview/i }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: /sync|syncing/i }) as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, json: () => Promise.resolve(result()) } as Response);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows a plain error when the request fails", async () => {
    fetchMock.mockReturnValue(jsonRes({ error: "nope" }, false));
    render(<MirrorPanel pageId={PAGE} lastRunAt={null} lastResult={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(screen.getByText(/something went wrong\. please try again\./i)).toBeTruthy());
    expect(refresh).not.toHaveBeenCalled();
  });
});
