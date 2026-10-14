// tests/landing-registration-ops-card.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/landing/registration/RegistrationModal", () => {
  const Stub = (p: { open: boolean; testMode?: boolean; tracking?: boolean; slug: string }) =>
    p.open ? <div role="dialog" aria-label="Test registration">{`slug=${p.slug} test=${String(p.testMode)} tracking=${String(p.tracking)}`}</div> : null;
  return { default: Stub, RegistrationModal: Stub };
});

import { RegistrationOpsCard, sheetUrl } from "@/components/admin/landing/registration/RegistrationOpsCard";

const PAGE = "00000000-0000-4000-8000-000000000001";
type Reply = { status: number; body: unknown } | "offline";
let jobsReply: Reply;
let sheetReply: Reply;
let retryReply: Reply;
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const answer = (r: Reply) => {
  if (r === "offline") throw new TypeError("Failed to fetch");
  return { ok: r.status < 300, status: r.status, json: async () => r.body };
};
const summary = (waiting: number, failed: number, issues: unknown[] = [], sheet: { waiting?: number; failed?: number } = {}) => ({
  status: 200, body: { waiting, failed, sheetWaiting: sheet.waiting ?? waiting, sheetFailed: sheet.failed ?? failed, issues },
});
const issue = (over: Record<string, unknown> = {}) => ({
  id: "j1", type: "sheet_append", status: "failed", attempts: 5, lastError: "Apps Script timed out.", nextRunAt: "2026-10-13T10:00:00Z",
  refId: "PZA-PPC-001", name: "Sara Ali", email: "sara@mail.com", isTest: false, ...over,
});

beforeEach(() => {
  refresh.mockReset(); toast.success.mockReset(); toast.error.mockReset();
  jobsReply = summary(0, 0);
  sheetReply = { status: 201, body: { sheetId: "sheet-9", driveFolderId: "f", refPrefix: "PPC", sheetUrl: "x" } };
  retryReply = { status: 200, body: { requeued: 2 } };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/jobs/retry")) return answer(retryReply);
    if (url.endsWith("/jobs")) return answer(jobsReply);
    if (url.endsWith("/sheet") && init?.method === "POST") return answer(sheetReply);
    return answer({ status: 404, body: {} });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("RegistrationOpsCard: Google Sheet", () => {
  it("creates the event sheet and then links to it", async () => {
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId={null} />);
    expect(screen.getByText(/no sheet yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create event sheet/i }));
    const link = await screen.findByRole("link", { name: /open sheet/i });
    expect(link.getAttribute("href")).toBe("https://docs.google.com/spreadsheets/d/sheet-9/edit");
    expect(fetchMock()).toHaveBeenCalledWith(`/api/admin/landing-pages/${PAGE}/sheet`, expect.objectContaining({ method: "POST" }));
    expect(toast.success).toHaveBeenCalledWith("Event sheet created.");
  });
  it("shows the server's reason and keeps the button when the sheet cannot be made", async () => {
    sheetReply = { status: 422, body: { error: "Set a reference prefix (2 to 8 letters or numbers, for example PPC) in the registration settings first." } };
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /create event sheet/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/reference prefix/)));
    expect((screen.getByRole("button", { name: /create event sheet/i }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("refreshes the page when the server says a sheet already exists", async () => {
    sheetReply = { status: 409, body: { error: "This page already has a sheet.", sheetId: "sheet-0" } };
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /create event sheet/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith("This page already has a sheet.");
  });
  it("builds sheet links safely", () => {
    expect(sheetUrl("abc_123")).toBe("https://docs.google.com/spreadsheets/d/abc_123/edit");
  });
});

describe("RegistrationOpsCard: sheet and email tasks", () => {
  it("says all synced and disables Retry when nothing is waiting", async () => {
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId="s1" />);
    expect(await screen.findByText("All rows synced")).toBeTruthy();
    expect((screen.getByRole("button", { name: /retry now/i }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("lists failed and waiting tasks with plain labels, retries and reloads", async () => {
    jobsReply = summary(3, 1, [issue(), issue({ id: "j2", type: "email_received", status: "pending", attempts: 2, lastError: null, isTest: true })]);
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId="s1" />);
    expect(await screen.findByText("Sheet sync: 3 waiting")).toBeTruthy();
    expect(screen.getByText("Sheet sync: 1 failed")).toBeTruthy();
    const list = screen.getByRole("list", { name: /tasks that need attention/i });
    expect(within(list).getByText("Sheet row")).toBeTruthy();
    expect(within(list).getByText(/stopped after 5 tries: apps script timed out/i)).toBeTruthy();
    expect(within(list).getByText("Confirmation email")).toBeTruthy();
    expect(within(list).getByText("Test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("2 tasks sent again. The list updates in a minute."));
    const jobCalls = fetchMock().mock.calls.filter(([u]) => String(u).endsWith("/jobs"));
    expect(jobCalls.length).toBeGreaterThanOrEqual(2);
  });
  it("the Sheet sync pill counts only sheet rows; other unfinished tasks get their own pill", async () => {
    jobsReply = summary(5, 2, [issue()], { waiting: 1, failed: 0 });
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId="s1" />);
    expect(await screen.findByText("Sheet sync: 1 waiting")).toBeTruthy();
    expect(screen.queryByText(/Sheet sync: .* failed/)).toBeNull();
    expect(screen.queryByText("Sheet sync: 5 waiting")).toBeNull();
    expect(screen.getByText("Emails and test runs: 6 unfinished")).toBeTruthy();
  });
  it("enables Retry now when jobs are only waiting, and tells the truth about automatic retries", async () => {
    jobsReply = summary(2, 0, [issue({ status: "pending" })]);
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId="s1" />);
    await screen.findByText("Sheet sync: 2 waiting");
    expect((screen.getByRole("button", { name: /retry now/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Rows that fail are retried when you press Retry now, and once a day.")).toBeTruthy();
    expect(screen.queryByText(/about an hour/i)).toBeNull();
  });
  it("says so when the tasks cannot be loaded, and can check again", async () => {
    jobsReply = { status: 500, body: { error: "Could not load the background tasks." } };
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId="s1" />);
    expect(await screen.findByText(/couldn't load the background tasks/i)).toBeTruthy();
    jobsReply = summary(0, 0);
    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    expect(await screen.findByText("All rows synced")).toBeTruthy();
  });
});

describe("RegistrationOpsCard: try it yourself", () => {
  it("is disabled until the page is published", () => {
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="draft" initialSheetId={null} />);
    const b = screen.getByRole("button", { name: /register as a customer/i }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(screen.getByText("Publish the page first.")).toBeTruthy();
  });
  it("opens the real form in test mode without tracking", async () => {
    render(<RegistrationOpsCard pageId={PAGE} slug="ppc" status="published" initialSheetId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /register as a customer/i }));
    const dialog = await screen.findByRole("dialog", { name: "Test registration" });
    expect(dialog.textContent).toBe("slug=ppc test=true tracking=false");
  });
});
